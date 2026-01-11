
export enum ModelType {
  EQUITY_GBM = 'EQUITY_GBM',
  EQUITY_MERTON_JUMP = 'EQUITY_MERTON_JUMP',
  INTEREST_RATE_VASICEK = 'INTEREST_RATE_VASICEK',
  INTEREST_RATE_CIR = 'INTEREST_RATE_CIR',
  MACRO_INFLATION = 'MACRO_INFLATION',
  OU_PROCESS = 'OU_PROCESS'
}

export enum AssetClass {
  EQUITY = 'EQUITY',
  FIXED_INCOME = 'FIXED_INCOME',
  FX = 'FX',
  COMMODITY = 'COMMODITY',
  FORWARD = 'FORWARD',
  FUTURE = 'FUTURE',
  OPTION = 'OPTION',
  SWAP = 'SWAP',
  SWAPTION = 'SWAPTION',
  // Economic Factors
  CENTRAL_BANK_RATE = 'CENTRAL_BANK_RATE',
  INFLATION_RATE = 'INFLATION_RATE',
  UNEMPLOYMENT_RATE = 'UNEMPLOYMENT_RATE',
  TOTAL_PRODUCTIVITY = 'TOTAL_PRODUCTIVITY',
  GDP_GROWTH = 'GDP_GROWTH'
}

export interface Greeks {
  delta?: number;
  gamma?: number;
  theta?: number;
  rho?: number;
  vega?: number;
}

export interface CorrelationFactors {
  equity?: number;
  rates?: number;
  volatility?: number;
  commodity?: number;
}

export interface SynthesisParameters {
  modelType: ModelType;
  assetClass: AssetClass;
  initialValue: number;
  timeHorizon: number; // in days
  dt: number; // time step (usually 1/252 for daily)
  
  // Model specific
  mu?: number; // Drift / Expected Return
  sigma?: number; // Realized Volatility for path generation
  kappa?: number; // Mean reversion speed
  theta?: number; // Long-term mean

  // Correlation Matrix
  correlations?: CorrelationFactors;

  // Asset Specific Factors
  dividendYield?: number; // Equities
  peRatio?: number; // Equities - Price to Earnings
  expectedEarnings?: number; // Equities - Forward Earnings per share
  
  foreignRate?: number; // FX (r_f)
  domesticRate?: number; // FX (r_d)
  convenienceYield?: number; // Commodities
  storageCost?: number; // Commodities
  seasonalAmplitude?: number; // Commodities
  
  // Fixed Income Specific
  creditSpread?: number; // Spread over risk-free
  cdsSpread?: number; // Credit Default Swap spread component
  baseRate?: number; 

  // Derivative Specific
  strikePrice?: number;
  riskFreeRate?: number;
  expiryTime?: number; // in years
  isCall?: boolean;
  impliedVol?: number; // Implied volatility used for pricing (may differ from sigma)
  
  // Jump Diffusion specific
  lambda?: number; 
  jumpMu?: number; 
  jumpSigma?: number; 
}

export interface DataPoint {
  timestamp: string;
  value: number; // Primary asset price or rate
  underlyingValue?: number; // The underlying spot price (useful for Greeks)
  secondaryValue?: number; // Strike, Spread, or specific Greek
  peRatio?: number; // Dynamic fundamental factor
  expectedEarnings?: number; // Dynamic fundamental factor
  benchmarkValue?: number; // Correlated Market Factor path
  greeks?: Greeks;
  index: number;
}

export interface SynthesisResult {
  parameters: SynthesisParameters;
  data: DataPoint[];
  summary: {
    max: number;
    min: number;
    avg: number;
    vol: number;
  };
}
