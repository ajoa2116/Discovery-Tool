/** Ordinary UI uses the safe presentation, never a raw stack/technical payload. */
export function operationFeedback(body:unknown,fallback:string):string{
  if(!body||typeof body!=='object')return fallback;
  const value=body as {presentation?:{message?:unknown;reference?:unknown}};
  const message=typeof value.presentation?.message==='string'?value.presentation.message:fallback;
  const reference=value.presentation?.reference;
  return `${message}${typeof reference==='string'&&/^OP-[A-Z0-9-]{4,64}$/.test(reference)?` Reference: ${reference}`:''}`;
}
