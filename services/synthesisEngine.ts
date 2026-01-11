
import { ModelType, SynthesisParameters, DataPoint, SynthesisResult, AssetClass } from '../types';
import { getStandardNormal, calculateSummary, calculateBS, calculateBlackSwaption } from './mathUtils';

export const generateSynthesizedData = (params: SynthesisParameters): SynthesisResult => {
  const { 
    modelType, 
    assetClass,
    initialValue, 
    timeHorizon, 
    dt, 
    mu = 0.05, 
    sigma = 0.2, 
    kappa = 2.0, 
    theta = 0.05,
    lambda = 0,
    jumpMu = 0,
    jumpSigma = 0,
    dividendYield = 0,
    peRatio = 15,
    expectedEarnings = 5.0,
    foreignRate = 0,
    domesticRate = 0,
    convenienceYield = 0,
    storageCost = 0,
    seasonalAmplitude = 0,
    creditSpread = 0.01,
    cdsSpread = 0,
    strikePrice = 100,
    riskFreeRate = 0.03,
    expiryTime = 1.0,
    isCall = true,
    impliedVol = 0.2,
    correlations = {}
  } = params;
  
  // Pricing volatility for derivatives
  const pricingVol = impliedVol || sigma;

  const data: DataPoint[] = [];
  let currentSpot = initialValue;
  
  // Market Proxy Path starts at the same initial value for easier visual overlay
  let marketProxy = initialValue; 
  const marketMu = 0.06;
  const marketSigma = 0.15;

  const startDate = new Date();

  // Effective Drift Calculation based on Category
  let effectiveMu = mu;
  if (assetClass === AssetClass.EQUITY) {
    effectiveMu = mu - dividendYield;
  } else if (assetClass === AssetClass.FX) {
    // Interest Rate Parity Adjustment: effective drift = risk premium + (r_domestic - r_foreign)
    effectiveMu = mu + (domesticRate - foreignRate);
  } else if (assetClass === AssetClass.COMMODITY) {
    effectiveMu = mu + (storageCost - convenienceYield);
  } else if (assetClass === AssetClass.FORWARD || assetClass === AssetClass.FUTURE) {
    effectiveMu = riskFreeRate - dividendYield;
  } else if (assetClass === AssetClass.UNEMPLOYMENT_RATE) {
    effectiveMu = 0; 
  }

  // Calculate Aggregated Correlation Factor (Effective rho)
  const factorKeys = Object.keys(correlations) as (keyof typeof correlations)[];
  const rho = factorKeys.length > 0 
    ? Math.max(-1, Math.min(1, factorKeys.reduce((acc, k) => acc + (correlations[k] || 0), 0)))
    : 0;

  for (let i = 0; i <= timeHorizon; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const T = Math.max(0.0001, expiryTime - (i / 365));
    
    // Seasonal factor (Annual cycle)
    let seasonalShift = 0;
    const isMacroSeasonal = [AssetClass.COMMODITY, AssetClass.INFLATION_RATE, AssetClass.GDP_GROWTH].includes(assetClass);
    if (isMacroSeasonal && seasonalAmplitude > 0) {
      seasonalShift = Math.sin(2 * Math.PI * i / 252) * seasonalAmplitude;
    }

    let displayValue = currentSpot + seasonalShift;
    let greeks = undefined;
    let secondary = undefined;
    let pointPe = undefined;
    let pointEarnings = undefined;

    // Domain Specific Logic
    if (assetClass === AssetClass.FIXED_INCOME) {
      displayValue = riskFreeRate + creditSpread + cdsSpread + currentSpot;
      secondary = cdsSpread;
    } else if (assetClass === AssetClass.OPTION) {
      const bs = calculateBS(currentSpot, strikePrice, T, riskFreeRate, pricingVol, isCall);
      displayValue = bs.price;
      greeks = bs.greeks;
      secondary = strikePrice;
    } else if (assetClass === AssetClass.FORWARD || assetClass === AssetClass.FUTURE) {
      displayValue = currentSpot * Math.exp((riskFreeRate - dividendYield) * T);
      secondary = currentSpot;
    } else if (assetClass === AssetClass.SWAP) {
      displayValue = (currentSpot - (strikePrice / 1000 || 0.03)) * 10000;
      secondary = strikePrice;
    } else if (assetClass === AssetClass.SWAPTION) {
      const black = calculateBlackSwaption(currentSpot, (strikePrice / 1000 || 0.03), T, riskFreeRate, pricingVol, isCall);
      displayValue = black.price;
      greeks = black.greeks;
      secondary = strikePrice;
    } else if (assetClass === AssetClass.UNEMPLOYMENT_RATE) {
      displayValue = Math.max(2.0, currentSpot + seasonalShift);
    } else if (assetClass === AssetClass.INFLATION_RATE) {
      displayValue = currentSpot + seasonalShift;
    } else if (assetClass === AssetClass.EQUITY) {
      pointEarnings = expectedEarnings * Math.exp(0.03 * (i/252)); // 3% growth
      pointPe = displayValue / pointEarnings;
    }

    data.push({
      index: i,
      timestamp: currentDate.toISOString().split('T')[0],
      value: displayValue,
      underlyingValue: currentSpot,
      secondaryValue: secondary,
      peRatio: pointPe,
      expectedEarnings: pointEarnings,
      benchmarkValue: marketProxy,
      greeks
    });

    // Generate Correlated Random Shocks
    const marketEpsilon = getStandardNormal();
    const idiosyncraticEpsilon = getStandardNormal();
    
    // Correlation coupling formula: Z_asset = rho * Z_market + sqrt(1 - rho^2) * Z_idiosyncratic
    const assetEpsilon = (rho * marketEpsilon) + (Math.sqrt(1 - rho * rho) * idiosyncraticEpsilon);

    // Update Market Proxy (Geometric Brownian Motion)
    marketProxy = marketProxy * Math.exp((marketMu - 0.5 * marketSigma ** 2) * dt + marketSigma * Math.sqrt(dt) * marketEpsilon);

    // Update Primary Asset based on selected Stochastic Process
    switch (modelType) {
      case ModelType.EQUITY_GBM:
        const driftGBM = (effectiveMu - 0.5 * Math.pow(sigma, 2)) * dt;
        const diffusionGBM = sigma * Math.sqrt(dt) * assetEpsilon;
        currentSpot = currentSpot * Math.exp(driftGBM + diffusionGBM);
        break;

      case ModelType.EQUITY_MERTON_JUMP:
        const jumpOccurred = Math.random() < (lambda * dt);
        let jumpFactor = 1.0;
        if (jumpOccurred) {
            const jumpEpsilon = getStandardNormal();
            jumpFactor = Math.exp(jumpMu + jumpSigma * jumpEpsilon);
        }
        const driftMerton = (effectiveMu - 0.5 * Math.pow(sigma, 2)) * dt;
        const diffusionMerton = sigma * Math.sqrt(dt) * assetEpsilon;
        currentSpot = currentSpot * Math.exp(driftMerton + diffusionMerton) * jumpFactor;
        break;

      case ModelType.INTEREST_RATE_VASICEK:
        const meanReversionVas = kappa * (theta - currentSpot) * dt;
        const rateDiffusionVas = sigma * Math.sqrt(dt) * assetEpsilon;
        currentSpot = currentSpot + meanReversionVas + rateDiffusionVas;
        break;

      case ModelType.INTEREST_RATE_CIR:
        const currentLevel = Math.max(currentSpot, 0.0001);
        const meanReversionCIR = kappa * (theta - currentLevel) * dt;
        const rateDiffusionCIR = sigma * Math.sqrt(currentLevel) * Math.sqrt(dt) * assetEpsilon;
        currentSpot = currentLevel + meanReversionCIR + rateDiffusionCIR;
        break;

      case ModelType.MACRO_INFLATION:
      case ModelType.OU_PROCESS:
        const ouReversion = kappa * (theta - currentSpot) * dt;
        const ouNoise = sigma * Math.sqrt(dt) * assetEpsilon;
        currentSpot = currentSpot + (effectiveMu * dt) + ouReversion + ouNoise;
        break;
    }
  }

  const values = data.map(d => d.value);
  const summary = calculateSummary(values);

  return {
    parameters: params,
    data,
    summary
  };
};

export const convertToCSV = (data: DataPoint[]): string => {
  const headers = "Index,Date,Value,Underlying,PE_Ratio,Earnings,MarketProxy,Delta,Gamma,Vega,Theta,Rho\n";
  const rows = data.map(d => {
    const g = d.greeks || {};
    return `${d.index},${d.timestamp},${d.value.toFixed(6)},${d.underlyingValue?.toFixed(6) || ''},${d.peRatio?.toFixed(4)||''},${d.expectedEarnings?.toFixed(4)||''},${d.benchmarkValue?.toFixed(6) || ''},${g.delta?.toFixed(4)||''},${g.gamma?.toFixed(4)||''},${g.vega?.toFixed(4)||''},${g.theta?.toFixed(4)||''},${g.rho?.toFixed(4)||''}`;
  }).join("\n");
  return headers + rows;
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};
