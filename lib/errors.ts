import { officeInfo } from "./office-info";

export const ERROR_MESSAGES = {
  noSpecialist: `I'm sorry, we don't currently treat that condition at ${officeInfo.name}. I'd recommend consulting a specialist. Is there anything else I can help you with?`,
  noSlots: `I'm sorry, there are no available appointments for that request right now. Please call our office directly at ${officeInfo.phone} and we'll do our best to accommodate you.`,
  apiTimeout: "I'm taking a bit longer than expected. Please give me just a moment. If this continues, please refresh the page.",
  callFailed: "I wasn't able to connect the call right now. Would you like to continue our conversation here in the chat instead?",
  duplicateBooking: "It looks like that time slot was just taken. Let me show you the next available options.",
  invalidInput: "Some of the information entered doesn't look right. Please check your details and try again.",
  generalError: `I'm having trouble with that right now. Please try again or call our office at ${officeInfo.phone} for assistance.`,
  reservationExpired: "Your hold on that time has expired. Please choose a time again and I will hold it for you.",
  pickTimeFirst: "Please choose one of the available times first, and then I can confirm your booking.",
  unknownSlot: "I couldn't tell which time you meant. Please tap one of the times below or tell me the number.",
  sessionNotFound: "We could not find your session. Please start again from the beginning.",
  callTooSoon: "A call was just placed. Please wait two minutes before requesting another.",
  callLimit: "You have reached the maximum number of call requests for this session.",
};
