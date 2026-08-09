// src/features/fiscal/types/index.ts
export var ConversationStage;
(function (ConversationStage) {
    ConversationStage["IDLE"] = "IDLE";
    ConversationStage["WAITING_FISCAL_DATA"] = "WAITING_FISCAL_DATA";
    ConversationStage["WAITING_MERCHANT"] = "WAITING_MERCHANT";
    ConversationStage["PROCESSING"] = "PROCESSING";
    ConversationStage["COMPLETED"] = "COMPLETED";
    ConversationStage["REJECTED"] = "REJECTED";
})(ConversationStage || (ConversationStage = {}));
