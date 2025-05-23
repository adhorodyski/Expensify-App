import type {OnyxEntry} from 'react-native-onyx';
import type {ValueOf} from 'type-fest';
import CONST from '@src/CONST';
import type {OriginalMessageIOU, Policy, Report, ReportAction, Transaction} from '@src/types/onyx';
import {convertToDisplayString} from './CurrencyUtils';
import {getIOUActionForTransactionID, getOriginalMessage, isMoneyRequestAction} from './ReportActionsUtils';
import {
    getMoneyRequestSpendBreakdown,
    getNonHeldAndFullAmount,
    hasHeldExpenses as hasHeldExpensesReportUtils,
    hasOnlyHeldExpenses as hasOnlyHeldExpensesReportUtils,
    hasUpdatedTotal,
} from './ReportUtils';

/**
 * In MoneyRequestReport we filter out some IOU action types, because expense/transaction data is displayed in a separate list
 * at the top
 */
const IOU_ACTIONS_TO_FILTER_OUT: Array<OriginalMessageIOU['type']> = [CONST.IOU.REPORT_ACTION_TYPE.CREATE, CONST.IOU.REPORT_ACTION_TYPE.TRACK];

/**
 * Returns whether a specific action should be displayed in the feed/message list on MoneyRequestReportView.
 *
 * In MoneyRequestReport we filter out some action types, because expense/transaction data is displayed in a separate list
 * at the top the report, instead of in-between the rest of messages like in normal chat.
 * Because of that several action types are not relevant to this ReportView and should not be shown.
 */
function isActionVisibleOnMoneyRequestReport(action: ReportAction) {
    if (isMoneyRequestAction(action)) {
        const originalMessage = getOriginalMessage(action);
        return originalMessage ? !IOU_ACTIONS_TO_FILTER_OUT.includes(originalMessage.type) : false;
    }

    return action.actionName !== CONST.REPORT.ACTIONS.TYPE.CREATED;
}

/**
 * Give a list of report actions and a list of transactions,
 * function will return a list of reportIDs for the threads for the IOU parent action of every transaction.
 * It is used in UI to allow for navigation to "sibling" transactions when opening a single transaction (report) view.
 */

function getThreadReportIDsForTransactions(reportActions: ReportAction[], transactions: Transaction[]) {
    return transactions
        .map((transaction) => {
            const action = getIOUActionForTransactionID(reportActions, transaction.transactionID);
            return action?.childReportID;
        })
        .filter((reportID): reportID is string => !!reportID);
}

const IOU_REPORT_PREVIEW_BUTTON = {
    PAY: CONST.REPORT.PRIMARY_ACTIONS.PAY,
    APPROVE: CONST.REPORT.PRIMARY_ACTIONS.APPROVE,
    EXPORT: CONST.REPORT.PRIMARY_ACTIONS.EXPORT_TO_ACCOUNTING,
    REVIEW: CONST.REPORT.PRIMARY_ACTIONS.REVIEW_DUPLICATES,
    SUBMIT: CONST.REPORT.PRIMARY_ACTIONS.SUBMIT,
    NONE: undefined,
};

/**
 * Determines the total amount to be displayed based on the selected button type in the IOU Report Preview.
 *
 * @param report - Onyx report object
 * @param policy - Onyx policy object
 * @param buttonType - The type of button selected which determines how amounts are calculated and displayed.
 * @returns - The total amount to be formatted as a string. Returns an empty string if no amount is applicable.
 */
const getTotalAmountForIOUReportPreviewButton = (report: OnyxEntry<Report>, policy: OnyxEntry<Policy>, buttonType: ValueOf<typeof IOU_REPORT_PREVIEW_BUTTON>) => {
    // Return empty string for certain button types where the total amount isn't needed.
    if (buttonType === IOU_REPORT_PREVIEW_BUTTON.NONE || buttonType === IOU_REPORT_PREVIEW_BUTTON.EXPORT) {
        return '';
    }

    // Determine whether the non-held amount is appropriate to display for the PAY button.
    const {nonHeldAmount, hasValidNonHeldAmount} = getNonHeldAndFullAmount(report, buttonType === IOU_REPORT_PREVIEW_BUTTON.PAY);
    const hasOnlyHeldExpenses = hasOnlyHeldExpensesReportUtils(report?.reportID);
    const canAllowSettlement = hasUpdatedTotal(report, policy);

    // Split the total spend into different categories as needed.
    const {totalDisplaySpend, reimbursableSpend} = getMoneyRequestSpendBreakdown(report);

    if (buttonType === IOU_REPORT_PREVIEW_BUTTON.PAY) {
        // Return empty string if there are only held expenses which cannot be paid.
        if (hasOnlyHeldExpenses) {
            return '';
        }

        // We shouldn't display the nonHeldAmount as the default option if it's not valid since we cannot pay partially in this case
        if (hasHeldExpensesReportUtils(report?.reportID) && canAllowSettlement && hasValidNonHeldAmount) {
            return nonHeldAmount;
        }

        // Default to reimbursable spend for PAY button if above conditions are not met.
        return convertToDisplayString(reimbursableSpend, report?.currency);
    }

    // For all other cases, return the total display spend.
    return convertToDisplayString(totalDisplaySpend, report?.currency);
};

/**
 * Determines the appropriate button type for the IOU Report Preview based on the given flags.
 *
 * @param flags - An object containing boolean flags indicating button visibility options.
 * @param flags.shouldShowSubmitButton - Flag indicating if the submit button should be shown.
 * @param flags.shouldShowExportIntegrationButton - Flag indicating if the export integration button should be shown.
 * @param flags.shouldShowRBR - Flag indicating if the RBR button should be shown.
 * @param flags.shouldShowSettlementButton - Flag indicating if the settlement button should be shown.
 * @param flags.shouldShowPayButton - Flag indicating if the pay button should be shown.
 * @param flags.shouldShowApproveButton - Flag indicating if the approve button should be shown.
 * @returns - Returns the type of button that should be displayed based on the input flags.
 */
const getIOUReportPreviewButtonType = ({
    shouldShowSubmitButton,
    shouldShowExportIntegrationButton,
    shouldShowApproveButton,
    shouldShowSettlementButton,
    shouldShowPayButton,
    shouldShowRBR,
}: {
    shouldShowSubmitButton: boolean;
    shouldShowExportIntegrationButton: boolean;
    shouldShowRBR: boolean;
    shouldShowSettlementButton: boolean;
    shouldShowPayButton: boolean;
    shouldShowApproveButton: boolean;
}): ValueOf<typeof IOU_REPORT_PREVIEW_BUTTON> => {
    const shouldShowSettlementWithoutRBR = shouldShowSettlementButton && !shouldShowRBR;
    const shouldShowSettlementOrRBR = shouldShowSettlementButton || shouldShowRBR;
    const shouldShowSettlementOrExport = shouldShowSettlementButton || shouldShowExportIntegrationButton;

    if (shouldShowSettlementWithoutRBR && shouldShowPayButton) {
        return IOU_REPORT_PREVIEW_BUTTON.PAY;
    }
    if (shouldShowSettlementWithoutRBR && shouldShowApproveButton) {
        return IOU_REPORT_PREVIEW_BUTTON.APPROVE;
    }

    if (!shouldShowSettlementOrRBR && shouldShowExportIntegrationButton) {
        return IOU_REPORT_PREVIEW_BUTTON.EXPORT;
    }

    if (shouldShowRBR && !shouldShowSubmitButton && shouldShowSettlementOrExport) {
        return IOU_REPORT_PREVIEW_BUTTON.REVIEW;
    }

    if (shouldShowSubmitButton) {
        return IOU_REPORT_PREVIEW_BUTTON.SUBMIT;
    }

    return IOU_REPORT_PREVIEW_BUTTON.NONE;
};

export {isActionVisibleOnMoneyRequestReport, getThreadReportIDsForTransactions, getTotalAmountForIOUReportPreviewButton, getIOUReportPreviewButtonType, IOU_REPORT_PREVIEW_BUTTON};
