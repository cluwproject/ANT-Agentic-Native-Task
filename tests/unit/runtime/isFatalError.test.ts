import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isFatalError, FATAL_ERROR_MARKERS } from '../../../src/runtime/executor.js';

describe('runtime/executor — isFatalError', () => {
  it('detects each fatal marker', () => {
    for (const marker of FATAL_ERROR_MARKERS) {
      assert.strictEqual(
        isFatalError(`ERROR: ${marker}: something went wrong`),
        true,
        `marker ${marker} should be fatal`,
      );
    }
  });

  it('returns false for ordinary errors', () => {
    assert.strictEqual(isFatalError('ERROR: file not found'), false);
    assert.strictEqual(isFatalError('Tool timed out after 3000ms'), false);
    assert.strictEqual(isFatalError(''), false);
  });

  it('is case-sensitive (markers are UPPERCASE by convention)', () => {
    assert.strictEqual(isFatalError('access_denied'), false);
  });
});
