const { createHandler } = require('@app-core/server');
const parseInstruction = require('@app/services/payment-processor/parse-instruction');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],
  async handler(rc, helpers) {
    const payload = rc.body;

    try {
      const response = await parseInstruction(payload);

      // Determine HTTP status based on response status
      const httpStatus =
        response.status === 'failed'
          ? helpers.http_statuses.HTTP_400_BAD_REQUEST
          : helpers.http_statuses.HTTP_200_OK;

      return {
        status: httpStatus,
        data: response,
      };
    } catch (error) {
      // If it's an application error, extract status code from context
      if (error.isApplicationError && error.context?.status_code) {
        // Create a failed response with the error details
        const failedResponse = {
          type: null,
          amount: null,
          currency: null,
          debit_account: null,
          credit_account: null,
          execute_by: null,
          status: 'failed',
          status_reason: error.message,
          status_code: error.context.status_code,
          accounts: payload.accounts
            ? payload.accounts.map((acc) => ({
                id: acc.id,
                balance: acc.balance,
                balance_before: acc.balance,
                currency: acc.currency.toUpperCase(),
              }))
            : [],
        };

        return {
          status: helpers.http_statuses.HTTP_400_BAD_REQUEST,
          data: failedResponse,
        };
      }

      // Re-throw if not handled
      throw error;
    }
  },
});
