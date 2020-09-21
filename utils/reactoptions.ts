export const MAX_REACT_OPTIONS = 20;
const optionsPoint1 = 0xD83C;
const optionsPoint2 = 56806; // decimal value for hex 0xDDE6
export const reactOptions = Array(20).fill(null).map((_v, i) => String.fromCharCode(optionsPoint1, i + optionsPoint2));