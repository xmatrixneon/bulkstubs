import { RESPONSES } from '../utils/responses';
import prisma from '../db/prisma';

// Helper: Validate API key
async function validateApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    return { valid: false, user: null };
  }

  const user = await prisma.user.findUnique({
    where: { apiKey }
  });

  if (!user) {
    return { valid: false, user: null };
  }

  return { valid: true, user };
}

// Helper: Generate random cooldown between 5-20 minutes
function getRandomCooldownMinutes(): number {
  return Math.floor(Math.random() * 16) + 5; // 5-20 random
}

// Helper: Check if number is locked for this country/service
async function isNumberLocked(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const lock = await prisma.lock.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      locked: true
    }
  });
  return !!lock;
}

// Helper: Check if number has active order for this country/service
async function hasActiveOrder(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const order = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      active: true,
      isused: false
    }
  });
  return !!order;
}

// Helper: Check if number was used recently (within 4 hours) for this country/service
async function hasRecentUsage(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const recentOrder = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      isused: true,
      createdAt: { gte: fourHoursAgo }
    }
  });
  return !!recentOrder;
}

// Helper: Check if number is under cooldown (for canceled orders)
async function isUnderCooldown(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const cooldownOrder = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      isused: false,
      active: false // canceled or expired
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!cooldownOrder) {
    return false;
  }

  // FIXED: Use stored cooldown end time if available, otherwise calculate and store it
  let cooldownEndTime;

  if (cooldownOrder.cooldownUntil) {
    // Use existing cooldown end time
    cooldownEndTime = new Date(cooldownOrder.cooldownUntil);
  } else {
    // Calculate and store cooldown end time (5-20 minutes)
    const cooldownMinutes = getRandomCooldownMinutes();
    cooldownEndTime = new Date(cooldownOrder.updatedAt.getTime() + cooldownMinutes * 60 * 1000);

    // Store it for future checks
    await prisma.orders.update({
      where: { id: cooldownOrder.id },
      data: { cooldownUntil: cooldownEndTime }
    });
  }

  const now = new Date();

  return now < cooldownEndTime;
}

/**
 * Buy Number - Smart number allocation
 * PHP equivalent: action=getNumber
 */
export async function buynumber(params: { api_key?: string; service?: string; country?: string }): Promise<string> {
  const { api_key, service, country } = params;

  // Validate API key
  const validation = await validateApiKey(api_key);
  if (!validation.valid) {
    return RESPONSES.BAD_KEY;
  }

  // Validate inputs
  if (!service) {
    return RESPONSES.BAD_SERVICE;
  }

  if (!country) {
    return RESPONSES.BAD_COUNTRY;
  }

  // Get service by code
  const servicesdata = await prisma.service.findFirst({
    where: { code: service, active: true }
  });

  if (!servicesdata) {
    return RESPONSES.BAD_SERVICE;
  }

  // Get country by code
  const countrydata = await prisma.country.findFirst({
    where: { code: country, active: true }
  });

  if (!countrydata) {
    return RESPONSES.BAD_COUNTRY;
  }

  // Smart number allocation with max retries
  const maxTries = 20;
  const triedNumbers = new Set<number>();
  let validNumber: any = null;

  for (let i = 0; i < maxTries; i++) {
    // Get random available numbers, excluding already tried ones
    const availableNumbers = await prisma.numbers.findMany({
      where: {
        active: true,
        countryid: countrydata.id,
        suspended: false,
        ...(triedNumbers.size > 0 && { number: { notIn: Array.from(triedNumbers) } })
      },
      take: 50
    });

    if (availableNumbers.length === 0) {
      return RESPONSES.NO_NUMBER;
    }

    // Pick random number from candidates
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const numberDoc = availableNumbers[randomIndex]!;

    // Track this number as tried
    triedNumbers.add(numberDoc.number);

    // Check 1: Lock checking
    const isLocked = await isNumberLocked(numberDoc.number, countrydata.id, servicesdata.id);
    if (isLocked) {
      continue;
    }

    // Check 2: Active order checking
    const hasActive = await hasActiveOrder(numberDoc.number, countrydata.id, servicesdata.id);
    if (hasActive) {
      continue;
    }

    // Check 3: Cooldown checking (5-20 minutes for canceled orders)
    const underCooldown = await isUnderCooldown(numberDoc.number, countrydata.id, servicesdata.id);
    if (underCooldown) {
      continue;
    }

    // All checks passed
    validNumber = numberDoc;
    break;
  }

  if (!validNumber) {
    return RESPONSES.NO_NUMBER;
  }

  // Create order with service templates
  const order = await prisma.orders.create({
    data: {
      number: validNumber.number,
      countryid: countrydata.id,
      serviceid: servicesdata.id,
      dialcode: countrydata.dialcode,
      active: true,
      message: [],
      format: servicesdata.format as any,
      maxmessage: servicesdata.maxmessage,
      ismultiuse: servicesdata.multisms,
      nextsms: false,
      isused: false
    }
  });

  // Format phone number for response (remove country code prefix if 12 digits)
  let number = validNumber.number.toString();
  if (number.length === 12) {
    number = number.substring(2);
  }

  return `ACCESS_NUMBER:${order.id}:${countrydata.dialcode}${number}`;
}

/**
 * Get SMS - OTP retrieval with timeout
 * PHP equivalent: action=getStatus
 */
export async function getsms(params: { api_key?: string; id?: string }): Promise<string> {
  const { api_key, id } = params;

  // Validate API key
  const validation = await validateApiKey(api_key);
  if (!validation.valid) {
    return RESPONSES.BAD_KEY;
  }

  // Validate inputs
  if (!id) {
    return RESPONSES.NO_ACTIVATION;
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  });

  if (!order || !order.active) {
    return RESPONSES.NO_ACTIVATION;
  }

  // Check 20-minute timeout
  const now = new Date();
  const orderAge = now.getTime() - order.createdAt.getTime();
  const twentyMinutes = 20 * 60 * 1000;

  if (orderAge > twentyMinutes) {
    // Auto-cancel after 20 minutes
    await prisma.orders.update({
      where: { id },
      data: {
        active: false,
        failureReason: 'timeout'
      }
    });

    return RESPONSES.STATUS_CANCEL;
  }

  // Get messages
  const messages = Array.isArray(order.message) ? order.message : [];

  if (messages.length === 0) {
    return RESPONSES.STATUS_WAIT_CODE;
  }

  // Return last message (OTP) - remove colons
  const lastMessage = messages[messages.length - 1];
  const otp = String(lastMessage).replace(/:/g, '');

  return `STATUS_OK:${otp}`;
}

/**
 * Set Cancel/Status - Cancel or retry order
 * PHP equivalent: action=setStatus
 */
export async function setcancel(params: { api_key?: string; id?: string; status?: string }): Promise<string> {
  const { api_key, id, status } = params;

  // Validate API key
  const validation = await validateApiKey(api_key);
  if (!validation.valid) {
    return RESPONSES.BAD_KEY;
  }

  // Validate inputs
  if (!id) {
    return RESPONSES.NO_ACTIVATION;
  }

  if (!status || (status !== '8' && status !== '3')) {
    return RESPONSES.BAD_STATUS;
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  });

  if (!order || !order.active) {
    return RESPONSES.NO_ACTIVATION;
  }

  if (status === '8') {
    // Cancel order
    if (!order.isused) {
      // Early cancel protection: deny if < 2 minutes old
      const now = new Date();
      const orderAgeSeconds = (now.getTime() - order.createdAt.getTime()) / 1000;
      const earlyCancelWindow = 2 * 60; // 2 minutes

      if (orderAgeSeconds < earlyCancelWindow) {
        return RESPONSES.EARLY_CANCEL_DENIED;
      }

      // Mark as cancelled
      await prisma.orders.update({
        where: { id },
        data: {
          active: false,
          failureReason: 'user_cancelled',
          qualityImpact: 0
        }
      });

      return RESPONSES.ACCESS_CANCEL;
    } else {
      // Already used - mark as completed
      await prisma.orders.update({
        where: { id },
        data: {
          active: false,
          isused: true
        }
      });

      return RESPONSES.ACCESS_ACTIVATION;
    }
  }

  if (status === '3') {
    // Request next SMS (multi-use retry)
    if (order.isused) {
      // Already has SMS - set nextsms=true
      await prisma.orders.update({
        where: { id },
        data: {
          nextsms: true,
          updatedAt: new Date()
        }
      });

      return RESPONSES.ACCESS_RETRY_GET;
    } else {
      // First SMS not received yet
      return RESPONSES.ACCESS_READY;
    }
  }

  return RESPONSES.BAD_STATUS;
}
