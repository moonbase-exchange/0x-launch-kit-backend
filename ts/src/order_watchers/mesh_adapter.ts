import { SignedOrder } from '0x.js';
import { orderParsingUtils } from '@0x/order-utils';
import * as _ from 'lodash';
import * as Web3Providers from 'web3-providers';

import { MESH_ENDPOINT } from '../config';
import {
    AdaptedOrderAndValidationResult,
    AdaptedValidationResults,
    OrderWatcherLifeCycleCallback,
    OrderWatcherLifeCycleEvents,
} from '../types';
import { utils } from '../utils';

interface StringifiedSignedOrder {
    senderAddress: string;
    makerAddress: string;
    takerAddress: string;
    makerFee: string;
    takerFee: string;
    makerAssetAmount: string;
    takerAssetAmount: string;
    makerAssetData: string;
    takerAssetData: string;
    salt: string;
    exchangeAddress: string;
    feeRecipientAddress: string;
    expirationTimeSeconds: string;
    signature: string;
}

enum OrderEventKind {
    Invalid = 'INVALID',
    Added = 'ADDED',
    Filled = 'FILLED',
    FullyFilled = 'FULLY_FILLED',
    Cancelled = 'CANCELLED',
    Expired = 'EXPIRED',
    Unfunded = 'UNFUNDED',
    FillabilityIncreased = 'FILLABILITY_INCREASED',
}

interface OrderEventPayload {
    subscription: string;
    result: OrderEvent[];
}

interface OrderEvent {
    orderHash: string;
    signedOrder: StringifiedSignedOrder;
    kind: OrderEventKind;
    fillableTakerAssetAmount: string;
    txHash: string;
}

interface AcceptedOrderInfo {
    orderHash: string;
    signedOrder: StringifiedSignedOrder;
    fillableTakerAssetAmount: string;
}

enum RejectedKind {
    ZeroexValidation = 'ZEROEX_VALIDATION',
    MeshError = 'MESH_ERROR',
    MeshValidation = 'MESH_VALIDATION',
}

enum RejectedCode {
    InternalError = 'InternalError',
    MaxOrderSizeExceeded = 'MaxOrderSizeExceeded',
    OrderAlreadyStored = 'OrderAlreadyStored',
    OrderForIncorrectNetwork = 'OrderForIncorrectNetwork',
    NetworkRequestFailed = 'NetworkRequestFailed',
    OrderHasInvalidMakerAssetAmount = 'OrderHasInvalidMakerAssetAmount',
    OrderHasInvalidTakerAssetAmount = 'OrderHasInvalidTakerAssetAmount',
    OrderExpired = 'OrderExpired',
    OrderFullyFilled = 'OrderFullyFilled',
    OrderCancelled = 'OrderCancelled',
    OrderUnfunded = 'OrderUnfunded',
    OrderHasInvalidMakerAssetData = 'OrderHasInvalidMakerAssetData',
    OrderHasInvalidTakerAssetData = 'OrderHasInvalidTakerAssetData',
    OrderHasInvalidSignature = 'OrderHasInvalidSignature',
}

interface RejectedStatus {
    code: RejectedCode;
    message: string;
}

interface RejectedOrderInfo {
    orderHash: string;
    signedOrder: StringifiedSignedOrder;
    kind: RejectedKind;
    status: RejectedStatus;
}

interface ValidationResults {
    accepted: AcceptedOrderInfo[];
    rejected: RejectedOrderInfo[];
}

const BATCH_SIZE = 18;
const SLEEP_INTERVAL = 1000;

export class MeshAdapter {
    private _wsClient: any;
    private _isConnectedToMesh: boolean = false;
    private readonly _lifeCycleEventCallback: OrderWatcherLifeCycleCallback;
    constructor(lifeCycleEventCallback: OrderWatcherLifeCycleCallback) {
        this._lifeCycleEventCallback = lifeCycleEventCallback;
        void this._connectToMeshAsync();
    }
    public async addOrdersAsync(orders: SignedOrder[]): Promise<AdaptedValidationResults> {
        const validationResults: AdaptedValidationResults = { accepted: [], rejected: [] };
        if (orders.length === 0) {
            return validationResults;
        }
        while (!this._isConnectedToMesh) {
            utils.log('Attempting to connnect to Mesh...');
            await utils.sleepAsync(SLEEP_INTERVAL);
        }
        const orderChunks = _.chunk(orders, BATCH_SIZE);
        for (const chunk of orderChunks) {
            const { accepted, rejected } = await this._submitOrdersToMeshAsync(chunk);
            const adaptAcceptedValidationResults: AdaptedOrderAndValidationResult[] = (accepted || []).map(r => ({
                order: orderParsingUtils.convertOrderStringFieldsToBigNumber(r.signedOrder),
                message: undefined,
            }));
            const adaptRejectedValidationResults: AdaptedOrderAndValidationResult[] = (rejected || []).map(r => ({
                order: orderParsingUtils.convertOrderStringFieldsToBigNumber(r.signedOrder),
                message: `${r.kind} ${(r.status as any).Code}: ${(r.status as any).Message}`,
            }));
            validationResults.accepted = [...validationResults.accepted, ...adaptAcceptedValidationResults];
            validationResults.rejected = [...validationResults.rejected, ...adaptRejectedValidationResults];
        }
        return validationResults;
    }
    // tslint:disable-next-line: prefer-function-over-method no-empty
    public removeOrders(_orders: SignedOrder[]): void { }
    // tslint:disable-next-line: prefer-function-over-method
    public orderFilter(_order: SignedOrder): boolean {
        return false;
    }
    private async _connectToMeshAsync(): Promise<void> {
        while (!this._isConnectedToMesh) {
            try {
                this._wsClient = new Web3Providers.WebsocketProvider(MESH_ENDPOINT);
                const subscriptionId = await this._wsClient.subscribe('mesh_subscribe', 'orders', []);
                this._wsClient.on(subscriptionId, this._onOrderEventCallbackAsync.bind(this));
                this._isConnectedToMesh = true;
            } catch (err) {
                await utils.sleepAsync(SLEEP_INTERVAL);
            }
        }
    }
    private async _onOrderEventCallbackAsync(eventPayload: OrderEventPayload): Promise<void> {
        for (const event of eventPayload.result) {
            const signedOrder = orderParsingUtils.convertOrderStringFieldsToBigNumber(event.signedOrder);
            switch (event.kind) {
                case OrderEventKind.Added: {
                    this._lifeCycleEventCallback(OrderWatcherLifeCycleEvents.Add, signedOrder);
                    break;
                }
                case OrderEventKind.Cancelled:
                case OrderEventKind.Expired:
                case OrderEventKind.FullyFilled:
                case OrderEventKind.Unfunded: {
                    this._lifeCycleEventCallback(OrderWatcherLifeCycleEvents.Remove, signedOrder);
                    break;
                }
                case OrderEventKind.Filled: {
                    break;
                }
                case OrderEventKind.FillabilityIncreased: {
                    this._lifeCycleEventCallback(OrderWatcherLifeCycleEvents.Add, signedOrder);
                    break;
                }
                default:
                // noop
            }
        }
    }

    private async _submitOrdersToMeshAsync(signedOrders: SignedOrder[]): Promise<ValidationResults> {
        const stringifiedSignedOrders = signedOrders.map(stringifyOrder);
        const validationResults: ValidationResults = await this._wsClient.send('mesh_addOrders', [
            stringifiedSignedOrders,
        ]);
        return validationResults;
    }
}

const stringifyOrder = (signedOrder: SignedOrder): StringifiedSignedOrder => {
    const stringifiedSignedOrder = {
        signature: signedOrder.signature,
        senderAddress: signedOrder.senderAddress,
        makerAddress: signedOrder.makerAddress,
        takerAddress: signedOrder.takerAddress,
        makerFee: signedOrder.makerFee.toString(),
        takerFee: signedOrder.takerFee.toString(),
        makerAssetAmount: signedOrder.makerAssetAmount.toString(),
        takerAssetAmount: signedOrder.takerAssetAmount.toString(),
        makerAssetData: signedOrder.makerAssetData,
        takerAssetData: signedOrder.takerAssetData,
        salt: signedOrder.salt.toString(),
        exchangeAddress: signedOrder.exchangeAddress,
        feeRecipientAddress: signedOrder.feeRecipientAddress,
        expirationTimeSeconds: signedOrder.expirationTimeSeconds.toString(),
    };
    return stringifiedSignedOrder;
};
