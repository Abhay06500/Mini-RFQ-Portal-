import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessages } from './errors';

describe('error messages for forms', () => {
  it('lists every per-field problem returned by the server', () => {
    const error = new ApiError(422, 'RFQ_NOT_PUBLISHABLE', 'The RFQ cannot be published yet', [
      { field: 'lineItems', message: 'At least one line item is required' },
      { field: 'deadline', message: 'The submission deadline must be in the future' },
    ]);
    expect(errorMessages(error)).toEqual([
      'At least one line item is required',
      'The submission deadline must be in the future',
    ]);
  });

  it('falls back to the top-level message when there are no details', () => {
    expect(errorMessages(new ApiError(409, 'DEADLINE_PASSED', 'The submission deadline has passed.'))).toEqual([
      'The submission deadline has passed.',
    ]);
  });
});
