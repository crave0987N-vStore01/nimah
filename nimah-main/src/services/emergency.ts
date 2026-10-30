// Emergency "help" flow (pure logic with injected API). It always gives a cancel window first.
export const EMERGENCY_TRIGGER = /^(?:nimah[, ]+)?(?:help(?: me)?|emergency|sos|i need help|call for help|උදව්|උදව් කරන්න|හදිසියි|හදිසි අවස්ථාවක්|හදිසියක්)[.!]*$/i;
export const CANCEL_WORDS = /^(?:cancel|stop|no|nope|don'?t|abort|එපා|නවත්වන්න|අවලංගු(?: කරන්න)?|නැහැ|ඕනේ නැහැ)(?=\s|$|[.!?])/i;

export const parseEmergency = (t: string) => EMERGENCY_TRIGGER.test(t.trim());
export const isCancel = (t: string | null) => !!t && CANCEL_WORDS.test(t.trim());

export function parseContacts(csv: string): string[] {
  return csv.split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.replace(/\D/g, '').length >= 5);
}

export function buildEmergencySms(loc: { lat: number; lng: number } | null, si: boolean): string {
  const where = loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? ` https://maps.google.com/?q=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}` : '';
  return si ? `හදිසියි! මට උදව් ඕනේ. මගේ ස්ථානය:${where || ' නොදනී'}` : `EMERGENCY! I need help. My location:${where || ' unknown'}`;
}

export interface EmergencyApi {
  contacts: string[];
  ask(question: string): Promise<string | null>;
  getLocation(): Promise<{ lat: number; lng: number } | null>;
  sendSms(phone: string, message: string): Promise<unknown>;
  call(phone: string): Promise<unknown>;
}

export async function runEmergency(api: EmergencyApi, si: boolean): Promise<string> {
  if (!api.contacts.length) return si ? 'හදිසි අංක Settings වල දාලා නැහැ. මුලින්ම ඒක දාන්න.' : 'No emergency contacts are set. Add them in Settings first.';
  const answer = await api.ask(si ? 'හදිසි පණිවිඩය යවනවා. නවත්තන්න "එපා" කියන්න.' : 'Sending an emergency alert now. Say cancel to stop.');
  if (isCancel(answer)) return si ? 'හරි, අවලංගු කළා.' : 'Okay, cancelled.';
  const loc = await api.getLocation().catch(() => null);
  const msg = buildEmergencySms(loc, si);
  let sent = 0;
  for (const c of api.contacts) { try { await api.sendSms(c, msg); sent += 1; } catch { /* try the next one */ } }
  await api.call(api.contacts[0]).catch(() => {});
  return si ? `හදිසි පණිවිඩය ${sent}කට යැව්වා, ${api.contacts[0]} ට call කරනවා.` : `Alert sent to ${sent} contact${sent === 1 ? '' : 's'}. Calling ${api.contacts[0]}.`;
}
