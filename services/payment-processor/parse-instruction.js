const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const PaymentMessages = require('@app/messages/payment');

// Validator spec for input validation
const spec = `root {
  accounts[] {
    id string
    balance number
    currency string
  }
  instruction string
}`;

const parsedSpec = validator.parse(spec);

// Supported currencies
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// Status codes mapping
const STATUS_CODES = {
  INVALID_AMOUNT: 'AM01',
  CURRENCY_MISMATCH: 'CU01',
  UNSUPPORTED_CURRENCY: 'CU02',
  INSUFFICIENT_FUNDS: 'AC01',
  SAME_ACCOUNT: 'AC02',
  ACCOUNT_NOT_FOUND: 'AC03',
  INVALID_ACCOUNT_ID: 'AC04',
  INVALID_DATE: 'DT01',
  MISSING_KEYWORD: 'SY01',
  INVALID_KEYWORD_ORDER: 'SY02',
  MALFORMED: 'SY03',
  SUCCESS: 'AP00',
  PENDING: 'AP02',
};

// Helper function to normalize string (trim and lowercase)
function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase();
}

// Helper function to check if account ID is valid
function isValidAccountId(accountId) {
  if (typeof accountId !== 'string') return false;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId[i];
    const isLetter = (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
    const isDigit = char >= '0' && char <= '9';
    const isAllowed = char === '-' || char === '.' || char === '@';
    if (!isLetter && !isDigit && !isAllowed) {
      return false;
    }
  }
  return accountId.length > 0;
}

// Helper function to find keyword position (case-insensitive)
function findKeyword(text, keyword, startIndex = 0) {
  const normalizedText = normalizeString(text);
  const normalizedKeyword = normalizeString(keyword);
  return normalizedText.indexOf(normalizedKeyword, startIndex);
}

// Helper function to extract word at position
function extractWord(text, startIndex) {
  let endIndex = startIndex;
  while (endIndex < text.length && text[endIndex] !== ' ' && text[endIndex] !== '\t') {
    endIndex++;
  }
  return text.substring(startIndex, endIndex).trim();
}

// Parse DEBIT format instruction
function parseDebitFormat(instruction) {
  const result = {
    type: 'DEBIT',
    amount: null,
    currency: null,
    debitAccount: null,
    creditAccount: null,
    executeBy: null,
  };

  // Find DEBIT keyword
  const debitIndex = findKeyword(instruction, 'DEBIT');
  if (debitIndex === -1) return null;

  // Extract amount (after DEBIT)
  const afterDebit = instruction.substring(debitIndex + 5).trim();
  if (afterDebit.length === 0) return null;

  const amountStr = extractWord(afterDebit, 0);
  result.amount = amountStr;

  // Extract currency (after amount)
  const afterAmount = afterDebit.substring(amountStr.length).trim();
  if (afterAmount.length === 0) return null;

  const currencyStr = extractWord(afterAmount, 0);
  result.currency = currencyStr.toUpperCase();

  // Find FROM ACCOUNT
  const fromIndex = findKeyword(afterAmount, 'FROM');
  if (fromIndex === -1) return null;

  const afterFrom = afterAmount.substring(fromIndex + 4).trim();
  const accountKeyword = findKeyword(afterFrom, 'ACCOUNT');
  if (accountKeyword === -1) return null;

  const afterAccount = afterFrom.substring(accountKeyword + 7).trim();
  result.debitAccount = extractWord(afterAccount, 0);

  // Find FOR CREDIT TO ACCOUNT
  const forIndex = findKeyword(afterAccount, 'FOR');
  if (forIndex === -1) return null;

  const afterFor = afterAccount.substring(forIndex + 3).trim();
  const creditKeyword = findKeyword(afterFor, 'CREDIT');
  if (creditKeyword === -1) return null;

  const afterCredit = afterFor.substring(creditKeyword + 6).trim();
  const toKeyword = findKeyword(afterCredit, 'TO');
  if (toKeyword === -1) return null;

  const afterTo = afterCredit.substring(toKeyword + 2).trim();
  const account2Keyword = findKeyword(afterTo, 'ACCOUNT');
  if (account2Keyword === -1) return null;

  const afterAccount2 = afterTo.substring(account2Keyword + 7).trim();
  result.creditAccount = extractWord(afterAccount2, 0);

  // Check for ON date (optional)
  const onIndex = findKeyword(afterAccount2, 'ON');
  if (onIndex !== -1) {
    const afterOn = afterAccount2.substring(onIndex + 2).trim();
    const dateStr = extractWord(afterOn, 0);
    result.executeBy = dateStr;
  }

  return result;
}

// Parse CREDIT format instruction
function parseCreditFormat(instruction) {
  const result = {
    type: 'CREDIT',
    amount: null,
    currency: null,
    debitAccount: null,
    creditAccount: null,
    executeBy: null,
  };

  // Find CREDIT keyword
  const creditIndex = findKeyword(instruction, 'CREDIT');
  if (creditIndex === -1) return null;

  // Extract amount (after CREDIT)
  const afterCredit = instruction.substring(creditIndex + 6).trim();
  if (afterCredit.length === 0) return null;

  const amountStr = extractWord(afterCredit, 0);
  result.amount = amountStr;

  // Extract currency (after amount)
  const afterAmount = afterCredit.substring(amountStr.length).trim();
  if (afterAmount.length === 0) return null;

  const currencyStr = extractWord(afterAmount, 0);
  result.currency = currencyStr.toUpperCase();

  // Find TO ACCOUNT
  const toIndex = findKeyword(afterAmount, 'TO');
  if (toIndex === -1) return null;

  const afterTo = afterAmount.substring(toIndex + 2).trim();
  const accountKeyword = findKeyword(afterTo, 'ACCOUNT');
  if (accountKeyword === -1) return null;

  const afterAccount = afterTo.substring(accountKeyword + 7).trim();
  result.creditAccount = extractWord(afterAccount, 0);

  // Find FOR DEBIT FROM ACCOUNT
  const forIndex = findKeyword(afterAccount, 'FOR');
  if (forIndex === -1) return null;

  const afterFor = afterAccount.substring(forIndex + 3).trim();
  const debitKeyword = findKeyword(afterFor, 'DEBIT');
  if (debitKeyword === -1) return null;

  const afterDebit = afterFor.substring(debitKeyword + 5).trim();
  const fromKeyword = findKeyword(afterDebit, 'FROM');
  if (fromKeyword === -1) return null;

  const afterFrom = afterDebit.substring(fromKeyword + 4).trim();
  const account2Keyword = findKeyword(afterFrom, 'ACCOUNT');
  if (account2Keyword === -1) return null;

  const afterAccount2 = afterFrom.substring(account2Keyword + 7).trim();
  result.debitAccount = extractWord(afterAccount2, 0);

  // Check for ON date (optional)
  const onIndex = findKeyword(afterAccount2, 'ON');
  if (onIndex !== -1) {
    const afterOn = afterAccount2.substring(onIndex + 2).trim();
    const dateStr = extractWord(afterOn, 0);
    result.executeBy = dateStr;
  }

  return result;
}

// Validate date format YYYY-MM-DD
function isValidDateFormat(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (dateStr.length !== 10) return false;
  if (dateStr[4] !== '-' || dateStr[7] !== '-') return false;

  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  return true;
}

// Compare dates (UTC, date only)
function compareDates(dateStr1, dateStr2) {
  const d1 = new Date(`${dateStr1}T00:00:00Z`);
  const d2 = new Date(`${dateStr2}T00:00:00Z`);
  return d1.getTime() - d2.getTime();
}

// Check if date is in the future (UTC)
function isFutureDate(dateStr) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  return compareDates(dateStr, todayStr) > 0;
}

// Main parsing function
async function parseInstruction(serviceData) {
  let response;

  // Validate input
  const data = validator.validate(serviceData, parsedSpec);

  const { accounts, instruction } = data;

  // Try to parse instruction
  let parsed = parseDebitFormat(instruction);
  if (!parsed) {
    parsed = parseCreditFormat(instruction);
  }

  // If completely unparseable (check if we got the basic structure)
  // Note: amount might be invalid (negative/decimal), but we still got it, so continue
  if (
    !parsed ||
    !parsed.amount || // amount could be invalid string, but should exist
    parsed.amount === '' ||
    !parsed.currency ||
    !parsed.debitAccount ||
    !parsed.creditAccount
  ) {
    response = {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      status: 'failed',
      status_reason: PaymentMessages.MALFORMED_INSTRUCTION,
      status_code: STATUS_CODES.MALFORMED,
      accounts: [],
    };
    return response;
  }

  // Validate amount (now stored as string from parsing)
  const amountStr = String(parsed.amount || '').trim();

  // Check if amount is empty or invalid
  if (!amountStr || amountStr.length === 0) {
    throwAppError(PaymentMessages.INVALID_AMOUNT, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_AMOUNT },
    });
  }

  // Check for negative sign
  if (amountStr.includes('-')) {
    throwAppError(PaymentMessages.INVALID_AMOUNT, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_AMOUNT },
    });
  }

  // Check for decimal point
  if (amountStr.includes('.')) {
    throwAppError(PaymentMessages.INVALID_AMOUNT, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_AMOUNT },
    });
  }

  // Convert to number and validate
  const amount = parseInt(amountStr, 10);
  if (Number.isNaN(amount) || amount <= 0) {
    throwAppError(PaymentMessages.INVALID_AMOUNT, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_AMOUNT },
    });
  }

  // Store validated amount as number
  parsed.amount = amount;

  // Validate currency
  const currencyUpper = parsed.currency.toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currencyUpper)) {
    throwAppError(PaymentMessages.UNSUPPORTED_CURRENCY, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.UNSUPPORTED_CURRENCY },
    });
  }
  parsed.currency = currencyUpper;

  // Validate account IDs
  if (!isValidAccountId(parsed.debitAccount)) {
    throwAppError(PaymentMessages.INVALID_ACCOUNT_ID, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_ACCOUNT_ID },
    });
  }

  if (!isValidAccountId(parsed.creditAccount)) {
    throwAppError(PaymentMessages.INVALID_ACCOUNT_ID, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INVALID_ACCOUNT_ID },
    });
  }

  // Check if accounts are the same
  if (parsed.debitAccount === parsed.creditAccount) {
    throwAppError(PaymentMessages.SAME_ACCOUNT_ERROR, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.SAME_ACCOUNT },
    });
  }

  // Find accounts in the accounts array
  const debitAccountObj = accounts.find((acc) => acc.id === parsed.debitAccount);
  const creditAccountObj = accounts.find((acc) => acc.id === parsed.creditAccount);

  if (!debitAccountObj) {
    throwAppError(PaymentMessages.ACCOUNT_NOT_FOUND, ERROR_CODE.NOTFOUND, {
      context: { status_code: STATUS_CODES.ACCOUNT_NOT_FOUND },
    });
  }

  if (!creditAccountObj) {
    throwAppError(PaymentMessages.ACCOUNT_NOT_FOUND, ERROR_CODE.NOTFOUND, {
      context: { status_code: STATUS_CODES.ACCOUNT_NOT_FOUND },
    });
  }

  // Validate currency mismatch
  if (debitAccountObj.currency.toUpperCase() !== creditAccountObj.currency.toUpperCase()) {
    throwAppError(PaymentMessages.CURRENCY_MISMATCH, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.CURRENCY_MISMATCH },
    });
  }

  // Validate currency matches instruction
  if (debitAccountObj.currency.toUpperCase() !== parsed.currency) {
    throwAppError(PaymentMessages.CURRENCY_MISMATCH, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.CURRENCY_MISMATCH },
    });
  }

  // Validate date if provided
  let shouldExecute = true;
  if (parsed.executeBy) {
    if (!isValidDateFormat(parsed.executeBy)) {
      throwAppError(PaymentMessages.INVALID_DATE_FORMAT, ERROR_CODE.INVLDDATA, {
        context: { status_code: STATUS_CODES.INVALID_DATE },
      });
    }
    shouldExecute = !isFutureDate(parsed.executeBy);
  }

  // Check sufficient funds (only if executing immediately)
  if (shouldExecute && debitAccountObj.balance < parsed.amount) {
    throwAppError(PaymentMessages.INSUFFICIENT_FUNDS, ERROR_CODE.INVLDDATA, {
      context: { status_code: STATUS_CODES.INSUFFICIENT_FUNDS },
    });
  }

  // Prepare account objects with balance_before
  const debitAccountResponse = {
    id: debitAccountObj.id,
    balance: debitAccountObj.balance,
    balance_before: debitAccountObj.balance,
    currency: debitAccountObj.currency.toUpperCase(),
  };

  const creditAccountResponse = {
    id: creditAccountObj.id,
    balance: creditAccountObj.balance,
    balance_before: creditAccountObj.balance,
    currency: creditAccountObj.currency.toUpperCase(),
  };

  // Execute transaction if not pending
  if (shouldExecute) {
    debitAccountResponse.balance = debitAccountObj.balance - parsed.amount;
    creditAccountResponse.balance = creditAccountObj.balance + parsed.amount;
  }

  // Maintain order from original accounts array
  const accountsResponse = [];
  accounts.forEach((acc) => {
    if (acc.id === parsed.debitAccount) {
      accountsResponse.push(debitAccountResponse);
    } else if (acc.id === parsed.creditAccount) {
      accountsResponse.push(creditAccountResponse);
    }
  });

  // Build response
  response = {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    debit_account: parsed.debitAccount,
    credit_account: parsed.creditAccount,
    execute_by: parsed.executeBy || null,
    status: shouldExecute ? 'successful' : 'pending',
    status_reason: shouldExecute
      ? PaymentMessages.TRANSACTION_SUCCESSFUL
      : PaymentMessages.TRANSACTION_PENDING,
    status_code: shouldExecute ? STATUS_CODES.SUCCESS : STATUS_CODES.PENDING,
    accounts: accountsResponse,
  };

  return response;
}

module.exports = parseInstruction;
