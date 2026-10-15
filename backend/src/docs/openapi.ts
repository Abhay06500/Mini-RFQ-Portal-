/**
 * OpenAPI 3.0 description of /api/v1. Served as JSON at /api/v1/openapi.json and rendered by
 * Swagger UI at /api/docs. Roles are listed in each operation's description and enforced server-side.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

const json = (schema: object, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
];

const sampleRfqId = 'clx9rfq0001';
const sampleQuoteId = 'clx9quo0001';

const exampleCreateRfq = {
  title: 'Office supplies for Hyderabad site',
  description: 'Ergonomic chairs and standing-height desks for the new site office.',
  category: 'Office Supplies',
  deliveryLocation: 'Hyderabad',
  budget: '400000.00',
  deadline: '2026-11-20T17:00:00+05:30',
  lineItems: [
    { name: 'Office chair', quantity: 100, unit: 'pcs' },
    { name: 'Standing desk', quantity: 20, unit: 'pcs' },
  ],
};

const exampleSubmitQuote = {
  deliveryDays: 7,
  notes: 'Stock available in Hyderabad warehouse. GST extra.',
  lineItems: [
    { rfqLineItemId: 'clx9line0001', unitPrice: '2200.00' },
    { rfqLineItemId: 'clx9line0002', unitPrice: '7000.00' },
  ],
};

const exampleAwardResponse = {
  rfq: {
    id: sampleRfqId,
    status: 'AWARDED',
    awardedQuoteId: sampleQuoteId,
    awardedAt: '2026-11-21T06:00:00.000Z',
  },
  acceptedQuoteId: sampleQuoteId,
  rejectedQuoteIds: ['clx9quo0002'],
};

const operation = (
  tag: string,
  summary: string,
  roles: string,
  extra: Record<string, unknown> = {},
) => ({
  tags: [tag],
  summary,
  description: `Allowed roles: ${roles}.`,
  ...extra,
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Mini RFQ Portal API',
    version: '1.0.0',
    description:
      'REST API for publishing Requests for Quotation, submitting and revising quotations, comparing offers, and awarding an RFQ. All money is INR, sent as decimal strings with two places. Authentication uses an HttpOnly cookie named rfq_session set by /auth/login.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth' },
    { name: 'RFQs' },
    { name: 'Quotes' },
    { name: 'Files' },
    { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'rfq_session' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'DEADLINE_PASSED' },
              message: { type: 'string' },
              details: {},
            },
            required: ['code', 'message'],
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['BUYER', 'VENDOR', 'ADMIN'] },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LineItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'integer' },
          unit: { type: 'string' },
          sortOrder: { type: 'integer' },
        },
      },
      Rfq: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          buyerId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          deliveryLocation: { type: 'string' },
          budget: { type: 'string', nullable: true, example: '400000.00' },
          currency: { type: 'string', example: 'INR' },
          deadline: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED'] },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          awardedAt: { type: 'string', format: 'date-time', nullable: true },
          awardedQuoteId: { type: 'string', nullable: true },
          lineItems: { type: 'array', items: ref('LineItem') },
        },
      },
      QuoteRevision: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          revisionNumber: { type: 'integer' },
          deliveryDays: { type: 'integer' },
          notes: { type: 'string', nullable: true },
          totalAmount: { type: 'string', example: '360000.00' },
          createdAt: { type: 'string', format: 'date-time' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rfqLineItemId: { type: 'string' },
                itemName: { type: 'string' },
                quantity: { type: 'integer' },
                unit: { type: 'string' },
                unitPrice: { type: 'string', example: '2000.00' },
                lineTotal: { type: 'string', example: '200000.00' },
              },
            },
          },
        },
      },
      Quote: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rfqId: { type: 'string' },
          status: { type: 'string', enum: ['SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] },
          vendor: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
          submittedAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          currentRevision: { ...ref('QuoteRevision'), nullable: true },
          revisions: { type: 'array', items: ref('QuoteRevision') },
          attachments: { type: 'array', items: ref('FileAttachment') },
        },
      },
      FileAttachment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['PDF', 'XLSX'] },
          originalName: { type: 'string' },
          mimeType: { type: 'string' },
          sizeBytes: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          downloadUrl: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    '/auth/register': {
      post: operation('Auth', 'Register a Buyer or Vendor account', 'anonymous (Admin role requires adminInviteCode)', {
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: ['BUYER', 'VENDOR', 'ADMIN'], default: 'BUYER' },
                  adminInviteCode: { type: 'string', description: 'Required only when role is ADMIN' },
                },
              },
            },
          },
        },
        responses: {
          201: json({ type: 'object', properties: { user: ref('User') } }, 'Account created'),
          409: errorResponse('Email already registered'),
          422: errorResponse('Validation failed'),
          403: errorResponse('Invalid admin invitation code or admin registration disabled'),
        },
      }),
    },
    '/auth/login': {
      post: operation('Auth', 'Sign in and receive the session cookie', 'anonymous', {
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Signed in. Sets the rfq_session HttpOnly cookie.',
            headers: { 'Set-Cookie': { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'object', properties: { user: ref('User') } } } },
          },
          401: errorResponse('Invalid email or password'),
          403: errorResponse('Account disabled'),
          429: errorResponse('Too many attempts'),
        },
      }),
    },
    '/auth/logout': {
      post: operation('Auth', 'Clear the session cookie', 'any signed-in user', {
        responses: { 204: { description: 'Signed out' } },
      }),
    },
    '/auth/me': {
      get: operation('Auth', 'Return the current user', 'any signed-in user', {
        responses: {
          200: json({ type: 'object', properties: { user: ref('User') } }),
          401: errorResponse('Not signed in'),
        },
      }),
    },
    '/rfqs': {
      get: operation('RFQs', 'Vendor discovery: search open published RFQs', 'VENDOR', {
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'location', in: 'query', schema: { type: 'string' } },
          { name: 'deadlineFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'deadlineTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ...pageParams,
        ],
        responses: {
          200: json({
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              pagination: ref('Pagination'),
            },
          }),
          403: errorResponse('Not a vendor'),
        },
      }),
      post: operation('RFQs', 'Create a draft RFQ', 'BUYER', {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' }, example: exampleCreateRfq } },
        },
        responses: {
          201: json({ type: 'object', properties: { rfq: ref('Rfq') } }, 'Draft created'),
          422: errorResponse('Validation failed'),
        },
      }),
    },
    '/rfqs/mine': {
      get: operation('RFQs', 'List the buyer\'s own RFQs, optionally filtered by status', 'BUYER', {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED'] } },
          ...pageParams,
        ],
        responses: { 200: json({ type: 'object' }) },
      }),
    },
    '/rfqs/{id}': {
      parameters: [idParam],
      get: operation('RFQs', 'Get an RFQ. Vendors receive their own quotation summary only.', 'BUYER (owner), VENDOR (non-draft), ADMIN', {
        responses: {
          200: json({ type: 'object', properties: { rfq: ref('Rfq') } }),
          404: errorResponse('Not found or not visible to you'),
        },
      }),
      patch: operation('RFQs', 'Edit an RFQ. Published RFQs accept only description, budget and deadline extensions.', 'BUYER (owner)', {
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: {
          200: json({ type: 'object', properties: { rfq: ref('Rfq') } }),
          409: errorResponse('RFQ_LOCKED or RFQ_NOT_EDITABLE'),
          422: errorResponse('Validation failed or deadline not extendable'),
        },
      }),
    },
    '/rfqs/{id}/publish': {
      parameters: [idParam],
      post: operation('RFQs', 'Publish a draft RFQ', 'BUYER (owner)', {
        responses: {
          200: json({ type: 'object', properties: { rfq: ref('Rfq') } }, 'Published'),
          409: errorResponse('INVALID_TRANSITION (RFQ is not a draft)'),
          422: errorResponse('RFQ_NOT_PUBLISHABLE (no line items or deadline not in the future)'),
        },
      }),
    },
    '/rfqs/{id}/history': {
      parameters: [idParam],
      get: operation('RFQs', 'Status change history for an RFQ', 'BUYER (owner), ADMIN', {
        responses: { 200: json({ type: 'object' }), 404: errorResponse('Not found') },
      }),
    },
    '/rfqs/{id}/quotes': {
      parameters: [idParam],
      post: operation('Quotes', 'Submit a quotation (one per vendor per RFQ). Totals are calculated server-side.', 'VENDOR', {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' }, example: exampleSubmitQuote } },
        },
        responses: {
          201: json({ type: 'object', properties: { quote: ref('Quote') } }, 'Quotation submitted'),
          404: errorResponse('RFQ not found'),
          409: errorResponse('DEADLINE_PASSED, RFQ_NOT_OPEN or QUOTE_EXISTS'),
          422: errorResponse('QUOTE_INCOMPLETE or VALIDATION_FAILED'),
        },
      }),
    },
    '/rfqs/{id}/comparison': {
      parameters: [
        idParam,
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['total', 'deliveryTime'], default: 'total' } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
      ],
      get: operation('Quotes', 'Compare the latest revision of every quotation on an RFQ', 'BUYER (owner, after the RFQ closes), ADMIN', {
        responses: {
          200: json({ type: 'object', properties: { items: { type: 'array', items: ref('Quote') } } }),
          403: errorResponse('RFQ has not closed yet'),
        },
      }),
    },
    '/rfqs/{id}/award': {
      parameters: [idParam],
      post: operation('Quotes', 'Award one quotation. Atomic: the winner becomes ACCEPTED, the others REJECTED, and the RFQ AWARDED.', 'BUYER (owner)', {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['quoteId'], properties: { quoteId: { type: 'string' } } }, example: { quoteId: sampleQuoteId } } },
        },
        responses: {
          200: { description: 'Awarded', content: { 'application/json': { schema: { type: 'object' }, example: exampleAwardResponse } } },
          409: errorResponse('RFQ_NOT_CLOSED, RFQ_ALREADY_AWARDED or QUOTE_NOT_ELIGIBLE'),
          422: errorResponse('QUOTE_NOT_IN_RFQ'),
        },
      }),
    },
    '/rfqs/{id}/attachments': {
      parameters: [idParam],
      post: operation('Files', 'Upload a PDF or XLSX specification file (multipart field "file")', 'BUYER (owner)', {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
            },
          },
        },
        responses: {
          201: json({ type: 'object', properties: { attachment: ref('FileAttachment') } }, 'Stored'),
          409: errorResponse('RFQ_NOT_EDITABLE or ATTACHMENT_LIMIT'),
          422: errorResponse('FILE_TYPE_NOT_ALLOWED, FILE_SIGNATURE_MISMATCH, FILE_TOO_LARGE'),
        },
      }),
    },
    '/quotes/mine': {
      get: operation('Quotes', 'List the vendor\'s own quotations', 'VENDOR', {
        responses: { 200: json({ type: 'object', properties: { items: { type: 'array', items: { type: 'object' } } } }) },
      }),
    },
    '/quotes/{id}': {
      parameters: [idParam],
      get: operation('Quotes', 'Quotation detail with every revision. Vendors see their own; buyers see theirs after close.', 'VENDOR (owner), BUYER (owner, after close), ADMIN', {
        responses: {
          200: json({ type: 'object', properties: { quote: ref('Quote') } }),
          403: errorResponse('Quotations not yet visible to the buyer'),
          404: errorResponse('Not found or not visible to you'),
        },
      }),
      put: operation('Quotes', 'Revise your quotation before the deadline. Creates a new immutable revision.', 'VENDOR (owner)', {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' }, example: exampleSubmitQuote } },
        },
        responses: {
          200: json({ type: 'object', properties: { quote: ref('Quote') } }),
          409: errorResponse('DEADLINE_PASSED or QUOTE_LOCKED'),
          422: errorResponse('QUOTE_INCOMPLETE'),
        },
      }),
    },
    '/quotes/{id}/history': {
      parameters: [idParam],
      get: operation('Quotes', 'Status change history for a quotation', 'VENDOR (owner), BUYER (owner, after close), ADMIN', {
        responses: { 200: json({ type: 'object' }) },
      }),
    },
    '/quotes/{id}/shortlist': {
      parameters: [idParam],
      post: operation('Quotes', 'Shortlist a submitted quotation after the RFQ closes', 'BUYER (owner)', {
        responses: {
          200: json({ type: 'object', properties: { quote: ref('Quote') } }),
          409: errorResponse('RFQ_NOT_CLOSED or INVALID_TRANSITION'),
        },
      }),
    },
    '/quotes/{id}/attachments': {
      parameters: [idParam],
      post: operation('Files', 'Upload a quotation document (PDF or XLSX). Allowed until the deadline.', 'VENDOR (owner)', {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
            },
          },
        },
        responses: {
          201: json({ type: 'object', properties: { attachment: ref('FileAttachment') } }, 'Stored'),
          409: errorResponse('DEADLINE_PASSED, QUOTE_LOCKED or ATTACHMENT_LIMIT'),
        },
      }),
    },
    '/files/{id}': {
      parameters: [idParam],
      get: operation('Files', 'Download an authorized attachment', 'BUYER (owner), VENDOR (per visibility rules), ADMIN', {
        responses: {
          200: { description: 'File bytes', content: { 'application/pdf': {}, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} } },
          404: errorResponse('Not found or not visible to you'),
        },
      }),
    },
    '/admin/users': {
      get: operation('Admin', 'List users', 'ADMIN', {
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['BUYER', 'VENDOR', 'ADMIN'] } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          ...pageParams,
        ],
        responses: { 200: json({ type: 'object' }), 403: errorResponse('Not an admin') },
      }),
    },
    '/admin/users/{id}': {
      parameters: [idParam],
      patch: operation('Admin', 'Change a user\'s role or enable/disable the account', 'ADMIN', {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { role: { type: 'string' }, isActive: { type: 'boolean' } } } } },
        },
        responses: {
          200: json({ type: 'object', properties: { user: ref('User') } }),
          409: errorResponse('USER_HAS_ACTIVITY'),
          422: errorResponse('SELF_CHANGE_FORBIDDEN'),
        },
      }),
    },
    '/admin/rfqs': {
      get: operation('Admin', 'List all RFQs', 'ADMIN', {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'buyerId', in: 'query', schema: { type: 'string' } },
          ...pageParams,
        ],
        responses: { 200: json({ type: 'object' }) },
      }),
    },
    '/admin/quotes': {
      get: operation('Admin', 'List all quotations', 'ADMIN', {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'rfqId', in: 'query', schema: { type: 'string' } },
          ...pageParams,
        ],
        responses: { 200: json({ type: 'object' }) },
      }),
    },
  },
};
