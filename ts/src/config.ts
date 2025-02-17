// tslint:disable:custom-no-magic-numbers
import { BigNumber } from '0x.js';
import { assert } from '@0x/assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';

const metadataPath = path.join(__dirname, '../../metadata.json');
enum EnvVarType {
    Port,
    NetworkId,
    FeeRecipient,
    UnitAmount,
    Url,
    WhitelistAllTokens,
}
// Whitelisted token addresses. Set to a '*' instead of an array to allow all tokens.
export const WHITELISTED_TOKENS: string[] | '*' = _.isEmpty(process.env.WHITELIST_ALL_TOKENS)
    ? [
          '0x25629a835075cab4ff0f340ee6a350aa16ca475a', // BTCV on Mainnet
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH on Mainnet
          '0xE41d2489571d322189246DaFA5ebDe1F4699F498', // ZRX on Mainnet
          // '0x0ff589c7d3326d58c7893399c2076f6eb79cf9a3', // BTCV on Ropsten
          // '0xe809d1f733eb57a679118c57127021beb138b08f', // BTCV on Rinkeby
          // '0x01ea4ad4a2882444f9bdd8fcbdc1ee41e5cf82c0', // ZRX on Ropsten
          // '0xc778417e063141139fce010982780140aa0cd5ab', // WETH on Ropsten & Rinkeby
      ]
    : assertEnvVarType('WHITELIST_ALL_TOKENS', process.env.WHITELIST_ALL_TOKENS, EnvVarType.WhitelistAllTokens);

// Network port to listen on
export const HTTP_PORT = _.isEmpty(process.env.HTTP_PORT)
    ? 3000
    : assertEnvVarType('HTTP_PORT', process.env.HTTP_PORT, EnvVarType.Port);
// Default network id to use when not specified
export const NETWORK_ID = _.isEmpty(process.env.NETWORK_ID)
    ? 4
    : assertEnvVarType('NETWORK_ID', process.env.NETWORK_ID, EnvVarType.NetworkId);
// The fee recipient for orders
export const FEE_RECIPIENT = _.isEmpty(process.env.FEE_RECIPIENT)
    ? getDefaultFeeRecipient()
    : assertEnvVarType('FEE_RECIPIENT', process.env.FEE_RECIPIENT, EnvVarType.FeeRecipient);
// A flat fee in ZRX that should be charged to the order maker
export const MAKER_FEE_ZRX_UNIT_AMOUNT = _.isEmpty(process.env.MAKER_FEE_ZRX_UNIT_AMOUNT)
    ? new BigNumber(0)
    : assertEnvVarType('MAKER_FEE_ZRX_UNIT_AMOUNT', process.env.MAKER_FEE_ZRX_UNIT_AMOUNT, EnvVarType.UnitAmount);
// A flat fee in ZRX that should be charged to the order taker
export const TAKER_FEE_ZRX_UNIT_AMOUNT = _.isEmpty(process.env.TAKER_FEE_ZRX_UNIT_AMOUNT)
    ? new BigNumber(0)
    : assertEnvVarType('TAKER_FEE_ZRX_UNIT_AMOUNT', process.env.TAKER_FEE_ZRX_UNIT_AMOUNT, EnvVarType.UnitAmount);
// Ethereum RPC url
export const RPC_URL = _.isEmpty(process.env.RPC_URL)
    // ? 'https://rinkeby.infura.io/v3/50f53147cd654a88afd83a54f96dbe91'
    ? 'https://mainnet.infura.io/v3/50f53147cd654a88afd83a54f96dbe91'
    : assertEnvVarType('RPC_URL', process.env.RPC_URL, EnvVarType.Url);

// Address used when simulating transfers from the maker as part of 0x order validation
export const DEFAULT_TAKER_SIMULATION_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// A time window after which the order is considered permanently expired
export const ORDER_SHADOWING_MARGIN_MS = 100 * 1000; // tslint:disable-line custom-no-magic-numbers
// Frequency of checks for permanently expired orders
export const PERMANENT_CLEANUP_INTERVAL_MS = 10 * 1000; // tslint:disable-line custom-no-magic-numbers
// Max number of entities per page
export const MAX_PER_PAGE = 1000;
// Default ERC20 token precision
export const DEFAULT_ERC20_TOKEN_PRECISION = 18;

function assertEnvVarType(name: string, value: any, expectedType: EnvVarType): any {
    let returnValue;
    switch (expectedType) {
        case EnvVarType.Port:
            try {
                returnValue = parseInt(value, 10);
                const isWithinRange = returnValue >= 0 && returnValue <= 65535;
                if (!isWithinRange) {
                    throw new Error();
                }
            } catch (err) {
                throw new Error(`${name} must be between 0 to 65535, found ${value}.`);
            }
            return returnValue;
        case EnvVarType.NetworkId:
            try {
                returnValue = parseInt(value, 10);
            } catch (err) {
                throw new Error(`${name} must be a valid integer, found ${value}.`);
            }
            return returnValue;
        case EnvVarType.FeeRecipient:
            assert.isETHAddressHex(name, value);
            return value;
        case EnvVarType.Url:
            assert.isUri(name, value);
            return value;
        case EnvVarType.UnitAmount:
            try {
                returnValue = new BigNumber(parseFloat(value));
                if (returnValue.isNegative()) {
                    throw new Error();
                }
            } catch (err) {
                throw new Error(`${name} must be valid number greater than 0.`);
            }
            return returnValue;
        case EnvVarType.WhitelistAllTokens:
            return '*';
        default:
            throw new Error(`Unrecognised EnvVarType: ${expectedType} encountered for variable ${name}.`);
    }
}
function getDefaultFeeRecipient(): string {
    const metadata = JSON.parse(fs.readFileSync(metadataPath).toString());
    const existingDefault: string = metadata.DEFAULT_FEE_RECIPIENT;
    const newDefault: string = existingDefault || `0xabcabc${crypto.randomBytes(17).toString('hex')}`;
    if (_.isEmpty(existingDefault)) {
        const metadataCopy = JSON.parse(JSON.stringify(metadata));
        metadataCopy.DEFAULT_FEE_RECIPIENT = newDefault;
        fs.writeFileSync(metadataPath, JSON.stringify(metadataCopy));
    }
    return newDefault;
}
