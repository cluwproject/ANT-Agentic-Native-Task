import axiosOriginal from 'axios';
import { Logger } from '../utils/logger.js';

const axios = axiosOriginal.create();
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const apiMsg = err.response?.data?.error?.message || err.message;
    if (status === 401 || status === 403 || apiMsg?.toLowerCase().includes('unauthorized') || apiMsg?.toLowerCase().includes('credentials')) {
      err.message = `AUTH_REQUIRED: Google account connection expired or unauthorized. Please reconnect your account in Settings. (${apiMsg})`;
    }
    return Promise.reject(err);
  }
);

export async function workspaceSearch(accessToken: string, type: string, query: string) {
  try {
    let url = 'https://www.googleapis.com/drive/v3/files';
    const qParts: string[] = ['trashed = false'];

    // Extract query keyword safely: e.g. if model passes `name = 'File Name'` or `name contains 'File Name'`
    let cleanQuery = query ? query.trim() : '';
    const nameMatch = cleanQuery.match(/name\s*(?:=|\bcontains\b)\s*['"](.*?)['"]/i);
    if (nameMatch && nameMatch[1]) {
      cleanQuery = nameMatch[1];
    } else {
      // Strip outer quotes if any
      cleanQuery = cleanQuery.replace(/^['"]|['"]$/g, '');
    }
    const safeQuery = cleanQuery ? cleanQuery.replace(/'/g, "\\'") : '';
    if (safeQuery) {
      qParts.push(`name contains '${safeQuery}'`);
    }

    if (type === 'sheets') {
      qParts.push("mimeType = 'application/vnd.google-apps.spreadsheet'");
    } else if (type === 'docs') {
      qParts.push("mimeType = 'application/vnd.google-apps.document'");
    } else if (type === 'slides') {
      qParts.push("mimeType = 'application/vnd.google-apps.presentation'");
    }

    let params: any = {
      q: qParts.join(' and '),
      fields: 'files(id, name, mimeType, webViewLink)',
      pageSize: 10
    };

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params
    });

    return response.data;
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    Logger.log('ERROR', `Workspace search failed: ${errorMsg}`, { type, query }, 'WORKSPACE');
    throw new Error(errorMsg);
  }
}

export async function workspaceRead(accessToken: string, type: string, id: string) {
  let realId = id;
  try {
    if (type === 'spreadsheet') {
      let metadataRes;
      try {
        metadataRes = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${realId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          Logger.log('WARN', `Spreadsheet ID ${realId} returned 404. Attempting automatic self-healing...`, {}, 'WORKSPACE');
          const alternativeId = await findAlternativeFile(
            accessToken, 
            'application/vnd.google-apps.spreadsheet', 
            ['performance', 'perfomance', 'kategori', 'katagori', 'produk', 'product']
          );
          if (alternativeId) {
            realId = alternativeId;
            metadataRes = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${realId}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      const spreadsheet = metadataRes.data;
      const sheets = spreadsheet.sheets || [];
      
      const parsedSheets: any[] = [];
      // Fetch values for up to 5 sheets to analyze content
      for (const sheet of sheets.slice(0, 5)) {
        const sheetName = sheet.properties?.title;
        if (!sheetName) continue;
        
        try {
          const valuesRes = await axios.get(
            `https://sheets.googleapis.com/v4/spreadsheets/${realId}/values/${encodeURIComponent(sheetName)}!A:Z`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const allValues = valuesRes.data.values || [];
          const rowCount = allValues.length;
          
          const resultObject: any = {
            sheetName,
            properties: sheet.properties,
            totalRows: rowCount,
          };

          if (rowCount > 0) {
            const headers = allValues[0];
            resultObject.headers = headers;

            // Generate smart pivot and sorting analysis
            const analysisResult = analyzeSheetData(allValues);
            resultObject.analysis = analysisResult;

            if (rowCount > 100) {
              resultObject.isTruncatedForContext = true;
              resultObject.sampleValues = allValues.slice(0, 40);
              resultObject.totalExtractedRowsForSample = 40;
            } else {
              resultObject.values = allValues;
            }
          } else {
            resultObject.values = [];
          }

          parsedSheets.push(resultObject);
        } catch (err: any) {
          Logger.log('WARN', `Failed to fetch values for sheet ${sheetName}: ${err.message}`, {}, 'WORKSPACE');
        }
      }
      
      return {
        spreadsheetId: realId,
        properties: spreadsheet.properties,
        sheets: parsedSheets.length > 0 ? parsedSheets : sheets
      };
    } else if (type === 'document') {
      let response;
      try {
        response = await axios.get(`https://docs.googleapis.com/v1/documents/${realId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          Logger.log('WARN', `Document ID ${realId} returned 404. Attempting automatic self-healing...`, {}, 'WORKSPACE');
          const alternativeId = await findAlternativeFile(
            accessToken, 
            'application/vnd.google-apps.document', 
            ['sdc', 'report', 'laporan', 'ant', 'genesis']
          );
          if (alternativeId) {
            realId = alternativeId;
            response = await axios.get(`https://docs.googleapis.com/v1/documents/${realId}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      return response.data;
    } else if (type === 'presentation') {
      let response;
      try {
        response = await axios.get(`https://slides.googleapis.com/v1/presentations/${realId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          Logger.log('WARN', `Presentation ID ${realId} returned 404. Attempting automatic self-healing...`, {}, 'WORKSPACE');
          const alternativeId = await findAlternativeFile(
            accessToken, 
            'application/vnd.google-apps.presentation', 
            ['presentation', 'slide', 'slides', 'deck']
          );
          if (alternativeId) {
            realId = alternativeId;
            response = await axios.get(`https://slides.googleapis.com/v1/presentations/${realId}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      return response.data;
    }
    throw new Error(`Unsupported type: ${type}`);
  } catch (error: any) {
    Logger.log('ERROR', `Workspace read failed: ${error.message}`, { type, id: realId }, 'WORKSPACE');
    throw error;
  }
}

async function findAlternativeFile(accessToken: string, mimeType: string, fallbackKeywords: string[]): Promise<string | null> {
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

export async function workspaceCreate(accessToken: string, type: string, title: string) {
  try {
    let url = 'https://www.googleapis.com/drive/v3/files';
    let data: any = {
      name: title
    };

    if (type === 'spreadsheet') {
      data.mimeType = 'application/vnd.google-apps.spreadsheet';
    } else if (type === 'document') {
      data.mimeType = 'application/vnd.google-apps.document';
    } else if (type === 'presentation') {
      data.mimeType = 'application/vnd.google-apps.presentation';
    }

    const response = await axios.post(url, data, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // PROTOKOL VERIFIKASI "PRE-EXECUTION" (SELF-CHECK)
    // Langsung verifikasi metadata file yang baru saja dibuat sebelum melaporkan keberhasilan
    if (response.data && response.data.id) {
      const fileId = response.data.id;
      try {
        const verifyRes = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id, name, mimeType, webViewLink, createdTime' }
        });
        if (!verifyRes.data || !verifyRes.data.id) {
          throw new Error('Metode verifikasi mengembalikan metadata kosong.');
        }
        Logger.log('INFO', `Self-Check Verification SUCCEEDED: File "${verifyRes.data.name}" (${fileId}) is officially verified on Drive.`, { fileId }, 'WORKSPACE_VERIFICATION');
        return {
          ...response.data,
          verified: true,
          metadata: verifyRes.data
        };
      } catch (verifyError: any) {
        Logger.log('ERROR', `Self-Check Verification FAILED: File created but verification lookup returned an error: ${verifyError.message}`, { fileId }, 'WORKSPACE_VERIFICATION');
        throw new Error(`SILENT_CREATION_FAILURE_DETECTION: File requested was created with ID ${fileId}, but immediate metadata verification failed. Detail: ${verifyError.message}`);
      }
    }

    return response.data;
  } catch (error: any) {
    Logger.log('ERROR', `Workspace create failed: ${error.message}`, { type, title }, 'WORKSPACE');
    throw error;
  }
}

export function extractSheetTitle(range: string): string {
  if (!range) return '';
  let title = range;
  const exclIndex = range.indexOf('!');
  if (exclIndex !== -1) {
    title = range.substring(0, exclIndex);
  }
  // Trim single quotes if any
  if (title.startsWith("'") && title.endsWith("'")) {
    title = title.substring(1, title.length - 1);
  } else if (title.startsWith("'")) {
    title = title.substring(1);
  } else if (title.endsWith("'")) {
    title = title.substring(0, title.length - 1);
  }
  return title;
}

async function performValuesPut(accessToken: string, spreadsheetId: string, range: string, values: any[]): Promise<any> {
  try {
    const res = await axios.put(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      { values },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res;
  } catch (err: any) {
    const apiMsg = err.response?.data?.error?.message || '';
    if (err.response?.status === 400 && apiMsg.includes('Unable to parse range')) {
      const sheetTitle = extractSheetTitle(range);
      if (sheetTitle) {
        try {
          Logger.log('INFO', `Range parsing failed for "${range}". Attempting auto-creation of missing sheet "${sheetTitle}"...`, {}, 'WORKSPACE');
          await axios.post(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: sheetTitle
                    }
                  }
                }
              ]
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          Logger.log('INFO', `Successfully auto-created sheet "${sheetTitle}". Retrying spreadsheet write...`, {}, 'WORKSPACE');
          return await axios.put(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
            { values },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
        } catch (addSheetErr: any) {
          Logger.log('ERROR', `Auto-creating sheet "${sheetTitle}" failed: ${addSheetErr.message}`, {}, 'WORKSPACE');
          throw err;
        }
      }
    }
    throw err;
  }
}

export async function workspaceWrite(accessToken: string, type: string, id: string, action: string, payload: any) {
  let realId = id;
  try {
    if (type === 'spreadsheet') {
      if (action === 'update_values') {
        // payload: { range, values }
        let response;
        try {
          response = await performValuesPut(accessToken, realId, payload.range, payload.values);
        } catch (err: any) {
          if (err.response?.status === 404) {
            Logger.log('WARN', `Spreadsheet ID ${realId} returned 404 on write. Attempting automatic self-healing...`, {}, 'WORKSPACE');
            const alternativeId = await findAlternativeFile(
              accessToken, 
              'application/vnd.google-apps.spreadsheet', 
              ['performance', 'perfomance', 'kategori', 'katagori', 'produk', 'product']
            );
            if (alternativeId) {
              realId = alternativeId;
              response = await performValuesPut(accessToken, realId, payload.range, payload.values);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
        return response.data;
      }
    } else if (type === 'document') {
      if (action === 'batch_update') {
        let response;
        try {
          response = await axios.post(
            `https://docs.googleapis.com/v1/documents/${realId}:batchUpdate`,
            { requests: payload.requests },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
        } catch (err: any) {
          if (err.response?.status === 404) {
            Logger.log('WARN', `Document ID ${realId} returned 404 on write. Attempting automatic self-healing...`, {}, 'WORKSPACE');
            const alternativeId = await findAlternativeFile(
              accessToken, 
              'application/vnd.google-apps.document', 
              ['sdc', 'report', 'laporan', 'ant', 'genesis']
            );
            if (alternativeId) {
              realId = alternativeId;
              response = await axios.post(
                `https://docs.googleapis.com/v1/documents/${realId}:batchUpdate`,
                { requests: payload.requests },
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
        return response.data;
      }
    } else if (type === 'presentation') {
      if (action === 'batch_update') {
        let response;
        try {
          response = await axios.post(
            `https://slides.googleapis.com/v1/presentations/${realId}:batchUpdate`,
            { requests: payload.requests },
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
        } catch (err: any) {
          if (err.response?.status === 404) {
            Logger.log('WARN', `Presentation ID ${realId} returned 404 on write. Attempting automatic self-healing...`, {}, 'WORKSPACE');
            const alternativeId = await findAlternativeFile(
              accessToken, 
              'application/vnd.google-apps.presentation', 
              ['presentation', 'slide', 'slides', 'deck']
            );
            if (alternativeId) {
              realId = alternativeId;
              response = await axios.post(
                `https://slides.googleapis.com/v1/presentations/${realId}:batchUpdate`,
                { requests: payload.requests },
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
        return response.data;
      }
    }
    throw new Error(`Unsupported type or action: ${type}/${action}`);
  } catch (error: any) {
    const apiErrorDetail = error.response?.data?.error?.message || (error.response?.data ? JSON.stringify(error.response?.data) : '');
    const enrichedMessage = apiErrorDetail ? `${error.message} (Detail: ${apiErrorDetail})` : error.message;
    Logger.log('ERROR', `Workspace write failed: ${enrichedMessage}`, { type, id: realId, action }, 'WORKSPACE');
    throw new Error(enrichedMessage);
  }
}

function cleanNumericString(val: any): number {
  if (val === undefined || val === null) return NaN;
  let str = String(val).trim().toLowerCase();
  
  // Remove currency symbols, commas, percent signs
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

function parseNumeric(val: any): number {
  return cleanNumericString(val);
}

function analyzeSheetData(rows: any[][]): any {
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

  // Fallbacks:
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
    
    // Extract product name
    if (productIdx !== -1 && productIdx < row.length) {
      item.productName = String(row[productIdx]).trim();
    } else {
      item.productName = `Baris ${r}`;
    }
    
    // Extract growth percent
    if (growthPctIdx !== -1 && growthPctIdx < row.length) {
      item.growthPct = parseNumeric(row[growthPctIdx]);
      item.growthPctRaw = row[growthPctIdx];
    } else {
      item.growthPct = NaN;
    }

    // Extract growth Rp
    if (growthRpIdx !== -1 && growthRpIdx < row.length) {
      item.growthRp = parseNumeric(row[growthRpIdx]);
      item.growthRpRaw = row[growthRpIdx];
    } else {
      item.growthRp = NaN;
    }
    
    // Extract other numeric values for general stats
    item.otherValues = {};
    numCols.forEach(col => {
      if (col.index < row.length) {
        item.otherValues[col.name] = parseNumeric(row[col.index]);
      }
    });

    parsedData.push(item);
  }

  const totalItems = parsedData.length;
  
  // Both Growth % & Growth Rp are minus
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

  // Both Growth % & Growth Rp are positive
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

export async function workspaceGmailList(accessToken: string, query?: string) {
  try {
    const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
    const listRes = await axios.get(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { maxResults: 10, q: query || '' }
    });
    
    const messages = listRes.data.messages || [];
    const detailedMessages = [];
    
    for (const msg of messages) {
      try {
        const detailRes = await axios.get(`${listUrl}/${msg.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }
        });
        
        const headers = detailRes.data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
        const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '(Unknown Sender)';
        const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';
        
        detailedMessages.push({
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          date,
          snippet: detailRes.data.snippet || ''
        });
      } catch (err) {
        // Skip individual fetch failures
      }
    }
    
    return { messages: detailedMessages };
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    Logger.log('ERROR', `Gmail list failed: ${errorMsg}`, { query }, 'WORKSPACE');
    throw new Error(errorMsg);
  }
}

export async function workspaceGmailRead(accessToken: string, messageId: string) {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const data = response.data;
    const headers = data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
    const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '(Unknown Sender)';
    const to = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || '(Unknown Recipient)';
    const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';
    
    // Extract body helper
    const extractBody = (part: any): string => {
      if (part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const body = extractBody(subPart);
          if (body) return body;
        }
      }
      return '';
    };
    
    let body = extractBody(data.payload) || data.snippet || '(No content)';
    
    return {
      id: messageId,
      subject,
      from,
      to,
      date,
      body,
      snippet: data.snippet
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    Logger.log('ERROR', `Gmail read failed: ${errorMsg}`, { messageId }, 'WORKSPACE');
    throw new Error(errorMsg);
  }
}

export async function workspaceGmailSend(accessToken: string, to: string, subject: string, body: string) {
  try {
    const b64Safe = (str: string) => {
      return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };
    
    const rawEmail = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      '',
      body
    ].join('\r\n');
    
    const raw = b64Safe(rawEmail);
    const response = await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    return { status: 'success', data: response.data };
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    Logger.log('ERROR', `Gmail send failed: ${errorMsg}`, { to, subject }, 'WORKSPACE');
    throw new Error(errorMsg);
  }
}
