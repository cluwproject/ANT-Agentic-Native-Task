import axiosOriginal from 'axios';
import { Logger } from '../../utils/logger.js';
import { findAlternativeFile, extractSheetTitle, analyzeSheetData } from './state.js';

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

    let cleanQuery = query ? query.trim() : '';
    const nameMatch = cleanQuery.match(/name\s*(?:=|\bcontains\b)\s*['"](.*?)['"]/i);
    if (nameMatch && nameMatch[1]) {
      cleanQuery = nameMatch[1];
    } else {
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

export async function workspaceCreate(accessToken: string, type: string, title: string) {
  try {
    let url = 'https://www.googleapis.com/drive/v3/files';
    let data: any = { name: title };

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
            { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
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
      } catch (err) {}
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
