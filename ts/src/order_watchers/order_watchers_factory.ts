import { ContractWrappers, RPCSubprovider, Web3ProviderEngine } from '0x.js';
import { providerUtils } from '@0x/utils';

import { NETWORK_ID, RPC_URL, USE_MESH } from '../config';
import { OrderWatcherLifeCycleCallback } from '../types';

import { MeshAdapter } from './mesh_adapter';
import { OrderWatcherAdapter } from './order_watcher_adapter';

export const OrderWatchersFactory = {
    build(lifeCycleEventCallback: OrderWatcherLifeCycleCallback): OrderWatcherAdapter | MeshAdapter {
        const adapter = USE_MESH
            ? OrderWatchersFactory.buildMesh(lifeCycleEventCallback)
            : OrderWatchersFactory.buildOrderWatcher(lifeCycleEventCallback);
        return adapter;
    },
    buildOrderWatcher(lifeCycleEventCallback: OrderWatcherLifeCycleCallback): OrderWatcherAdapter {
        const provider = new Web3ProviderEngine();
        provider.addProvider(new RPCSubprovider(RPC_URL));
        providerUtils.startProviderEngine(provider);
        const contractWrappers = new ContractWrappers(provider, {
            networkId: NETWORK_ID,
        });
        const adapter = new OrderWatcherAdapter(provider, NETWORK_ID, lifeCycleEventCallback, contractWrappers);
        return adapter;
    },
    buildMesh(lifeCycleEventCallback: OrderWatcherLifeCycleCallback): MeshAdapter {
        const adapter = new MeshAdapter(lifeCycleEventCallback);
        return adapter;
    },
};
