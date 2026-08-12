import * as readline from 'readline';

/**
 * Custom prompt handler that supports Bracketed Paste Mode.
 * It intercepts \x1b[200~ and \x1b[201~ to bundle multiline pastes.
 */
export const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        const { stdin, stdout } = process;
        
        // Setup readline solely for history and basic line editing
        const rl = readline.createInterface({
            input: stdin,
            output: stdout,
            prompt: query,
            terminal: true
        });

        // Enable Bracketed Paste Mode on the terminal
        stdout.write('\x1b[?2004h');

        let isPasting = false;
        let pasteBuffer = '';
        
        // We override the internal _addChar / _insertString method or intercept the stream?
        // Node's readline parses data via `input.on('data')`. 
        // We can hook into stdin before readline processes it.
        const originalEmit = stdin.emit.bind(stdin);
        
        (stdin as any).emit = function (event: string, data: any) {
            if (event === 'data' && data) {
                const str = data.toString();
                
                if (str.includes('\x1b[200~')) {
                    isPasting = true;
                    // Strip the start marker and add to buffer
                    const parts = str.split('\x1b[200~');
                    if (parts[1] !== undefined) {
                        pasteBuffer += parts[1].replace('\x1b[201~', ''); // Just in case it ends immediately
                    }
                    return; // Swallow the event, don't pass to readline
                }
                
                if (isPasting) {
                    if (str.includes('\x1b[201~')) {
                        isPasting = false;
                        const parts = str.split('\x1b[201~');
                        pasteBuffer += parts[0];
                        
                        const lineCount = pasteBuffer.split('\n').length;
                        
                        // Let user know paste is buffered
                        readline.clearLine(stdout, 0);
                        readline.cursorTo(stdout, 0);
                        stdout.write(`${query}\x1b[36m[Pasted ${lineCount} lines] (Press Enter to submit)\x1b[0m`);
                        
                        // We do NOT pass this text to readline right now, we keep it in pasteBuffer
                        // and wait for the user to press Enter manually.
                        return;
                    } else {
                        pasteBuffer += str;
                        return; // Swallow
                    }
                }
            }
            // Pass all other events to readline normally
            return originalEmit(event, data);
        };

        rl.prompt();

        rl.on('line', (line) => {
            // Restore original emit
            (stdin as any).emit = originalEmit;
            
            // Disable bracketed paste
            stdout.write('\x1b[?2004l');
            rl.close();
            
            if (pasteBuffer) {
                resolve(pasteBuffer.trim());
            } else {
                resolve(line.trim());
            }
        });

        rl.on('SIGINT', () => {
            (stdin as any).emit = originalEmit;
            stdout.write('\x1b[?2004l');
            rl.close();
            process.exit(0);
        });
    });
};
