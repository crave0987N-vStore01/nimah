/** Error carrying a machine-readable code (same shape as native promise rejections). */
export const makeError = (code: string, message: string = code) =>
  Object.assign(new Error(message), { code });
