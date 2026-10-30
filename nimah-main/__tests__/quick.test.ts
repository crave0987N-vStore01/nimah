import { quickIntent } from '../src/services/quick';

describe('quickIntent', () => {
  it('opens apps from English commands', () => {
    const i = quickIntent('open tik tok', 'en-US')!;
    expect(i.action).toBe('open_app');
    expect(i.target).toBe('tik tok');
    expect(quickIntent('Please open the camera', 'en-US')!.target).toBe('camera');
    expect(quickIntent('launch WhatsApp.', 'en-US')!.target).toBe('WhatsApp');
  });
  it('opens apps from Singlish / Sinhala', () => {
    expect(quickIntent('youtube open karanna', 'si-LK')!.target).toBe('youtube');
    expect(quickIntent('whatsapp ඕපන් කරන්න', 'si-LK')!.target).toBe('whatsapp');
    expect(quickIntent('camera අරින්න', 'si-LK')!.action).toBe('open_app');
  });
  it('controls the torch', () => {
    expect(quickIntent('torch on', 'en-US')).toMatchObject({ action: 'flashlight', state: 'on' });
    expect(quickIntent('turn off the flashlight', 'en-US')).toMatchObject({ action: 'flashlight', state: 'off' });
    expect(quickIntent('ටෝච් එක දාන්න', 'si-LK')).toMatchObject({ state: 'on' });
    expect(quickIntent('ටෝච් එක නිවන්න', 'si-LK')).toMatchObject({ state: 'off' });
  });
  it('leaves anything complex to the AI', () => {
    expect(quickIntent('open whatsapp and send hi to Asanka', 'en-US')).toBeNull();
    expect(quickIntent('open wifi', 'en-US')).toBeNull();
    expect(quickIntent('send a message to mom', 'en-US')).toBeNull();
    expect(quickIntent('hello', 'en-US')).toBeNull();
    expect(quickIntent('torch', 'en-US')).toBeNull();
  });
});
