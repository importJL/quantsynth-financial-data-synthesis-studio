
/**
 * Box-Muller transform to generate normally distributed random numbers
 */
export const getStandardNormal = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val);
};

export const formatPercent = (val: number) => {
  return (val * 100).toFixed(2) + '%';
};

export const calculateSummary = (data: number[]) => {
  const sum = data.reduce((a, b) => a + b, 0);
  const avg = sum / data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const variance = data.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / data.length;
  const vol = Math.sqrt(variance);

  return { max, min, avg, vol };
};

/**
 * Standard Normal Cumulative Distribution Function
 */
const CND = (x: number): number => {
  const a1 = 0.31938153, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const L = Math.abs(x);
  const K = 1.0 / (1.0 + 0.2316419 * L);
  let w = 1.0 - 1.0 / Math.sqrt(2.0 * Math.PI) * Math.exp(-L * L / 2.0) * (a1 * K + a2 * K * K + a3 * Math.pow(K, 3) + a4 * Math.pow(K, 4) + a5 * Math.pow(K, 5));
  if (x < 0) w = 1.0 - w;
  return w;
};

/**
 * Normal PDF
 */
const normalPDF = (x: number): number => {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
};

/**
 * Black-Scholes Option Pricing and Greeks
 */
export const calculateBS = (S: number, K: number, T: number, r: number, sigma: number, isCall: boolean = true) => {
  if (T <= 0) return { price: Math.max(0, isCall ? S - K : K - S), greeks: { delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, vega: 0, theta: 0, rho: 0 } };
  
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2.0) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const price = isCall 
    ? S * CND(d1) - K * Math.exp(-r * T) * CND(d2)
    : K * Math.exp(-r * T) * CND(-d2) - S * CND(-d1);

  const delta = isCall ? CND(d1) : CND(d1) - 1;
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * normalPDF(d1) * Math.sqrt(T);
  const theta = isCall 
    ? -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * CND(d2)
    : -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * CND(-d2);
  const rho = isCall
    ? K * T * Math.exp(-r * T) * CND(d2)
    : -K * T * Math.exp(-r * T) * CND(-d2);

  return { price, greeks: { delta, gamma, vega, theta, rho } };
};

/**
 * Black's Model for Swaptions (Price is based on swap rates)
 */
export const calculateBlackSwaption = (F: number, K: number, T: number, r: number, sigma: number, isPayer: boolean = true) => {
  if (T <= 0) return { price: Math.max(0, isPayer ? F - K : K - F), greeks: { delta: isPayer ? (F > K ? 1 : 0) : (F < K ? -1 : 0), gamma: 0, vega: 0, theta: 0, rho: 0 } };

  // F: Forward Swap Rate, K: Strike Swap Rate
  const d1 = (Math.log(F / K) + (sigma * sigma / 2.0) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  // Simplified Annuity factor for swaption approximation
  const annuity = (1 - Math.exp(-r * 5)) / r; // Assuming a 5-year underlying swap for scale

  const price = annuity * Math.exp(-r * T) * (isPayer ? (F * CND(d1) - K * CND(d2)) : (K * CND(-d2) - F * CND(-d1)));

  // Greeks for Black's model (relative to forward rate)
  const delta = isPayer ? Math.exp(-r * T) * CND(d1) : -Math.exp(-r * T) * CND(-d1);
  const gamma = (Math.exp(-r * T) * normalPDF(d1)) / (F * sigma * Math.sqrt(T));
  const vega = annuity * Math.exp(-r * T) * F * normalPDF(d1) * Math.sqrt(T);
  const theta = -(annuity * Math.exp(-r * T) * F * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
  const rho = -T * price; // Simplified duration approximation

  return { price, greeks: { delta, gamma, vega, theta, rho } };
};
