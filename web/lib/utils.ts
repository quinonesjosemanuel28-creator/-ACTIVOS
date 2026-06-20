/** Une clases condicionales (filtra falsy). Liviano, sin dependencias. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
