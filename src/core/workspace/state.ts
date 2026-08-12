import axiosOriginal from 'axios';
import { Logger } from '../../utils/logger.js';

const axios = axiosOriginal.create();

export async function findAlternativeFile(accessToken: string, mimeType: string, fallbackKeywords: string[]): Promise<string | null> {
  try {
    const searchRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        q: `mimeType = '${mimeType}' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 50
      }
    });
    const files = searchRes.data.files || [];
    if (files.length === 0) return null;

    let bestMatch = null;
    let highestScore = 0;
    
    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      let score = 0;
      for (const keyword of fallbackKeywords) {
        if (lowerName.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = file;
      }
    }
    
    if (bestMatch && highestScore > 0) {
      Logger.log('INFO', `Self-healing: Found matching file "${bestMatch.name}" (${bestMatch.id})`, {}, 'WORKSPACE');
      return bestMatch.id;
    }
    
    Logger.log('INFO', `Self-healing: No keyword match, falling back to most recent file "${files[0].name}" (${files[0].id})`, {}, 'WORKSPACE');
    return files[0].id;
  } catch (e: any) {
    Logger.log('ERROR', `Self-healing lookup failed: ${e.message}`, {}, 'WORKSPACE');
    return null;
  }
}

export function extractSheetTitle(range: string): string {
  if (!range) return '';
  let title = range;
  const exclIndex = range.indexOf('!');
  if (exclIndex !== -1) {
    title = range.substring(0, exclIndex);
  }
  if (title.startsWith("'") && title.endsWith("'")) {
    title = title.substring(1, title.length - 1);
  } else if (title.startsWith("'")) {
    title = title.substring(1);
  } else if (title.endsWith("'")) {
    title = title.substring(0, title.length - 1);
  }
  return title;
}

export function cleanNumericString(val: any): number {
  if (val === undefined || val === null) return NaN;
  let str = String(val).trim().toLowerCase();
  str = str.replace(/[rp$%\s]/g, '');
  
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  
  if (hasComma && hasDot) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = str.split(',');
    if (parts[1] && parts[1].length === 3 && !parts[1].includes('-')) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/,/g, '.');
    }
  } else if (hasDot) {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    }
  }
  
  const parsed = parseFloat(str);
  return parsed;
}

export function parseNumeric(val: any): number {
  return cleanNumericString(val);
}

export function analyzeSheetData(rows: any[][]): any {
  if (rows.length < 2) return null;
  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  
  let productIdx = -1;
  let growthPctIdx = -1;
  let growthRpIdx = -1;
  
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.includes('nama_produk') || h === 'produk' || h === 'product' || h === 'nama produk' || (h.includes('nama') && h.includes('prod'))) {
      productIdx = i;
    } else if (h.includes('growth_%') || h.includes('growth %') || h.includes('growth_persen') || h === 'growth%' || h.includes('% growth') || h.includes('growth_percentage')) {
      growthPctIdx = i;
    } else if (h.includes('growth_rp') || h.includes('growth rp') || h.includes('growthrp') || h.includes('growth rp') || h.includes('growth nilai') || h === 'growth_rp') {
      growthRpIdx = i;
    }
  }

  if (productIdx === -1) {
    productIdx = headers.findIndex(h => h.includes('produk') || h.includes('product') || h.includes('nama') || h.includes('item'));
  }
  if (growthPctIdx === -1) {
    growthPctIdx = headers.findIndex(h => h.includes('%') || h.includes('percent') || h.includes('growth'));
  }
  if (growthRpIdx === -1) {
    growthRpIdx = headers.findIndex(h => h.includes('rp') || h.includes('rupiah') || h.includes('nilai'));
  }

  const numCols: { index: number; name: string }[] = [];
  headers.forEach((h, index) => {
    let numericCount = 0;
    const sampleSize = Math.min(rows.length - 1, 20);
    for (let r = 1; r <= sampleSize; r++) {
      if (rows[r] && rows[r][index] !== undefined) {
        const val = cleanNumericString(rows[r][index]);
        if (!isNaN(val)) numericCount++;
      }
    }
    if (numericCount > sampleSize * 0.7) {
      numCols.push({ index, name: rows[0][index] });
    }
  });

  const parsedData: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    
    const item: any = { rowIndex: r };
    
    if (productIdx !== -1 && productIdx < row.length) {
      item.productName = String(row[productIdx]).trim();
    } else {
      item.productName = `Baris ${r}`;
    }
    
    if (growthPctIdx !== -1 && growthPctIdx < row.length) {
      item.growthPct = parseNumeric(row[growthPctIdx]);
      item.growthPctRaw = row[growthPctIdx];
    } else {
      item.growthPct = NaN;
    }

    if (growthRpIdx !== -1 && growthRpIdx < row.length) {
      item.growthRp = parseNumeric(row[growthRpIdx]);
      item.growthRpRaw = row[growthRpIdx];
    } else {
      item.growthRp = NaN;
    }
    
    item.otherValues = {};
    numCols.forEach(col => {
      if (col.index < row.length) {
        item.otherValues[col.name] = parseNumeric(row[col.index]);
      }
    });

    parsedData.push(item);
  }

  const totalItems = parsedData.length;
  
  const doubleNegative = parsedData.filter(item => 
    !isNaN(item.growthPct) && item.growthPct < 0 && 
    !isNaN(item.growthRp) && item.growthRp < 0
  );
  
  const worstDoubleNegative = [...doubleNegative]
    .sort((a, b) => a.growthRp - b.growthRp)
    .slice(0, 5);

  const worstDoubleNegativePct = [...doubleNegative]
    .sort((a, b) => a.growthPct - b.growthPct)
    .slice(0, 5);

  const doublePositive = parsedData.filter(item => 
    !isNaN(item.growthPct) && item.growthPct >= 0 && 
    !isNaN(item.growthRp) && item.growthRp >= 0
  );
  
  const bestDoublePositiveRp = [...doublePositive]
    .sort((a, b) => b.growthRp - a.growthRp)
    .slice(0, 5);

  const bestDoublePositivePct = [...doublePositive]
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 5);

  const generalStats: any = {};
  numCols.forEach(col => {
    const vals = parsedData.map(item => item.otherValues[col.name]).filter(v => !isNaN(v));
    if (vals.length > 0) {
      vals.sort((a, b) => a - b);
      generalStats[col.name] = {
        min: vals[0],
        max: vals[vals.length - 1],
        avg: vals.reduce((total, num) => total + num, 0) / vals.length,
        sum: vals.reduce((total, num) => total + num, 0),
        top5: [...parsedData]
          .sort((a, b) => (b.otherValues[col.name] || 0) - (a.otherValues[col.name] || 0))
          .slice(0, 5)
          .map(i => ({ name: i.productName, value: i.otherValues[col.name] })),
        bottom5: [...parsedData]
          .sort((a, b) => (a.otherValues[col.name] || 0) - (b.otherValues[col.name] || 0))
          .slice(0, 5)
          .map(i => ({ name: i.productName, value: i.otherValues[col.name] }))
      };
    }
  });

  return {
    columnsDetected: {
      productIndex: productIdx,
      productHeaderName: productIdx !== -1 ? rows[0][productIdx] : null,
      growthPctIndex: growthPctIdx,
      growthPctHeaderName: growthPctIdx !== -1 ? rows[0][growthPctIdx] : null,
      growthRpIndex: growthRpIdx,
      growthRpHeaderName: growthRpIdx !== -1 ? rows[0][growthRpIdx] : null,
    },
    totalDataLines: totalItems,
    doubleNegativeCount: doubleNegative.length,
    doublePositiveCount: doublePositive.length,
    insights: {
      worstPerformersByRpMinusAndPctMinus: worstDoubleNegative.map(i => ({
        productName: i.productName,
        growthPct: i.growthPctRaw,
        growthRp: i.growthRpRaw,
        rowIndex: i.rowIndex
      })),
      worstPerformersByPctMinus: worstDoubleNegativePct.map(i => ({
        productName: i.productName,
        growthPct: i.growthPctRaw,
        growthRp: i.growthRpRaw,
        rowIndex: i.rowIndex
      })),
      bestPerformersByRp: bestDoublePositiveRp.map(i => ({
        productName: i.productName,
        growthPct: i.growthPctRaw,
        growthRp: i.growthRpRaw,
        rowIndex: i.rowIndex
      })),
      bestPerformersByPct: bestDoublePositivePct.map(i => ({
        productName: i.productName,
        growthPct: i.growthPctRaw,
        growthRp: i.growthRpRaw,
        rowIndex: i.rowIndex
      })),
    }
  };
}
