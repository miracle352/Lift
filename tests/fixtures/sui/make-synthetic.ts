/**
 * Builds the two synthetic fixtures from the real recorded transaction (grpc-getTransaction.json):
 *  - synthetic-tx-two-blobs.json: the real tx plus a second blob from a second account, to test per-blob grouping
 *  - synthetic-tx-seal.json: the real tx with its namespace replaced by the sample forecast's rcpt1 namespace
 *
 * Run: pnpm tsx tests/fixtures/sui/make-synthetic.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bcs } from '@mysten/sui/bcs';
import { toBase64 } from '@mysten/sui/utils';
import { sealNamespaceFor } from '../../../src/core';
import { sampleBlind } from '../../helpers/sample-forecast';

const dir = __dirname;
const real = JSON.parse(readFileSync(join(dir, 'grpc-getTransaction.json'), 'utf8'));
const pureString = (s: string) => ({ $kind: 'Pure', Pure: { bytes: toBase64(bcs.string().serialize(s).toBytes()) } });
const pureAddress = (a: string) => ({ $kind: 'Pure', Pure: { bytes: toBase64(bcs.Address.serialize(a).toBytes()) } });
const replacer = (_k: string, v: unknown) => (v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString('base64') } : v);
const write = (name: string, obj: unknown) => writeFileSync(join(dir, name), JSON.stringify(obj, replacer, 2) + '\n');

// --- seal fixture: same tx, namespace swapped for the sample forecast's seal namespace ---
const seal = structuredClone(real);
seal.Transaction.transaction.inputs[5] = pureString(sealNamespaceFor(sampleBlind()));
seal.Transaction._synthetic = 'Real tx 4xK2gvv6… with input[5] (memwal_namespace value) replaced by the sample forecast namespace.';
write('synthetic-tx-seal.json', seal);

// --- two-blob fixture: append a second blob written for a second account in the same PTB ---
const two = structuredClone(real);
const tx = two.Transaction.transaction;
const blob2 = '0x' + '22'.repeat(32);
const account2 = '0x' + '33'.repeat(32);
const owner2 = '0x' + '44'.repeat(32);
const idx = (input: unknown) => tx.inputs.push(input) - 1;
const iBlob2 = idx({ $kind: 'Object', Object: { $kind: 'ImmOrOwnedObject', ImmOrOwnedObject: { objectId: blob2, version: '1', digest: '11111111111111111111111111111111' } } });
const iAccount2 = idx({ $kind: 'Object', Object: { $kind: 'SharedObject', SharedObject: { objectId: account2, initialSharedVersion: '1', mutable: false } } });
const iRegistry = 2; // same shared registry as the real tx
const iFenceBytes = 1;
const iKeyNs = idx(pureString('memwal_namespace'));
const iValNs = idx(pureString('second-app'));
const iKeyOwner = idx(pureString('memwal_owner'));
const iValOwner = idx(pureString(owner2));
const iOwner2 = idx(pureAddress(owner2));
const transferIndex = tx.commands.findIndex((c: { $kind: string }) => c.$kind === 'TransferObjects');
const realTransfer = tx.commands.splice(transferIndex, 1)[0];
const pkg = tx.commands[1].MoveCall.package;
const fencePkg = tx.commands[0].MoveCall.package;
const input = (n: number) => ({ $kind: 'Input', Input: n });
tx.commands.push(
  { $kind: 'MoveCall', MoveCall: { package: fencePkg, module: 'account', function: 'seal_encrypt_fence', typeArguments: [], arguments: [input(iFenceBytes), input(iRegistry), input(iAccount2)] } },
  { $kind: 'MoveCall', MoveCall: { package: pkg, module: 'blob', function: 'insert_or_update_metadata_pair', typeArguments: [], arguments: [input(iBlob2), input(iKeyNs), input(iValNs)] } },
  { $kind: 'MoveCall', MoveCall: { package: pkg, module: 'blob', function: 'insert_or_update_metadata_pair', typeArguments: [], arguments: [input(iBlob2), input(iKeyOwner), input(iValOwner)] } },
  realTransfer,
  { $kind: 'TransferObjects', TransferObjects: { objects: [input(iBlob2)], address: input(iOwner2) } },
);
two.Transaction._synthetic = 'Real tx 4xK2gvv6… plus a second blob (0x22…) fenced for a second account (0x33…) and sent to 0x44….';
write('synthetic-tx-two-blobs.json', two);
console.log('wrote synthetic-tx-seal.json and synthetic-tx-two-blobs.json');
