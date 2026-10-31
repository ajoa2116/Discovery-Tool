/**
 * Isolated Phase 1 prototype. No HTTP, storage, filesystem or activation implementation.
 * The injected adapter must be this authority's sole generation-changing writer.
 * A returned rejection promises NO activation/side effects; thrown or inconsistent
 * results are UNKNOWN, never proof of rollback. The adapter must not schedule hidden
 * activation after its promise settles. A never-settling adapter blocks the queue.
 *
 * Epochs are supplied by the authority owner. Creating a new epoch/coordinator does
 * NOT prove the old authority retired. No restart durability, fencing, expiry,
 * eviction, authorization or production-readiness guarantee is implemented here.
 * Entries (including private synthetic payload strings) are retained for this
 * instance's lifetime. Do not supply real project files or credentials.
 */
export interface OpenAttemptIdentity {
  readonly epoch: string;
  readonly attemptId: string;
}

export interface OpenAdmissionInput extends OpenAttemptIdentity {
  readonly originatingGeneration: string;
  readonly payload: string;
}

export type AdmissionRefusal =
  | 'SETTLED_BEFORE_ARRIVAL' | 'STALE_GENERATION' | 'VALIDATION_REJECTED'
  | 'AUTHORITY_UNCERTAIN';
export type AdmissionUnknown =
  | 'NOT_FOUND' | 'EPOCH_MISMATCH' | 'INVALID_INPUT' | 'CAPACITY_EXHAUSTED'
  | 'IDENTITY_CONFLICT' | 'ACTIVATION_UNCERTAIN';
export type OpenAdmissionDisposition =
  | (OpenAttemptIdentity & {readonly status:'ADMITTED';readonly projectId:string;readonly activatedGeneration:string})
  | (OpenAttemptIdentity & {readonly status:'REJECTED_BEFORE_ACTIVATION';readonly reason:AdmissionRefusal})
  | (OpenAttemptIdentity & {readonly status:'PENDING'})
  | (OpenAttemptIdentity & {readonly status:'UNKNOWN';readonly reason:AdmissionUnknown});

export type ActivationResult =
  | {readonly status:'ADMITTED';readonly projectId:string;readonly activatedGeneration:string}
  | {readonly status:'REJECTED_BEFORE_ACTIVATION';readonly reason:'VALIDATION_REJECTED'};

interface Entry {
  readonly input?: Readonly<OpenAdmissionInput>; // Undefined means a settlement reservation.
  observation: Readonly<OpenAdmissionDisposition>;
  completion: Promise<Readonly<OpenAdmissionDisposition>>;
}

const token = (value:unknown):value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export class ProjectOpenAdmissionCoordinatorPrototype {
  readonly #epoch:string;
  readonly #capacity:number;
  readonly #maxPayloadCharacters:number;
  readonly #generation:()=>string;
  readonly #activate:(input:Readonly<OpenAdmissionInput>)=>ActivationResult|Promise<ActivationResult>;
  readonly #entries = new Map<string,Entry>();
  #tail:Promise<void> = Promise.resolve();
  #authorityUncertain = false;

  constructor(options:{
    epoch:string;
    capacity:number;
    maxPayloadCharacters?:number;
    currentGeneration:()=>string;
    activate:(input:Readonly<OpenAdmissionInput>)=>ActivationResult|Promise<ActivationResult>;
  }) {
    const limit=options.maxPayloadCharacters??65536;
    if(!token(options.epoch)||!Number.isSafeInteger(options.capacity)||options.capacity<1
      ||!Number.isSafeInteger(limit)||limit<1)throw new Error('Invalid prototype limits or epoch.');
    this.#epoch=options.epoch;this.#capacity=options.capacity;this.#maxPayloadCharacters=limit;
    this.#generation=options.currentGeneration;this.#activate=options.activate;
  }

  #identity(identity:OpenAttemptIdentity):OpenAttemptIdentity {
    return {epoch:identity.epoch,attemptId:identity.attemptId};
  }
  #unknown(identity:OpenAttemptIdentity,reason:AdmissionUnknown):Readonly<OpenAdmissionDisposition> {
    return Object.freeze({...this.#identity(identity),status:'UNKNOWN',reason});
  }
  #check(identity:OpenAttemptIdentity):Readonly<OpenAdmissionDisposition>|undefined {
    if(identity.epoch!==this.#epoch)return this.#unknown(identity,'EPOCH_MISMATCH');
    if(!token(identity.attemptId))return this.#unknown(identity,'INVALID_INPUT');
  }
  #reject(identity:OpenAttemptIdentity,reason:AdmissionRefusal):Readonly<OpenAdmissionDisposition> {
    return Object.freeze({...this.#identity(identity),status:'REJECTED_BEFORE_ACTIVATION',reason});
  }
  #reserve(identity:OpenAttemptIdentity,input?:Readonly<OpenAdmissionInput>):Entry|undefined {
    if(this.#entries.size>=this.#capacity)return;
    const entry:Entry={input,observation:Object.freeze({...this.#identity(identity),status:'PENDING'}),
      completion:Promise.resolve(this.#unknown(identity,'NOT_FOUND'))};
    this.#entries.set(identity.attemptId,entry);
    return entry;
  }
  #queue(entry:Entry,decide:()=>Promise<Readonly<OpenAdmissionDisposition>>):Promise<Readonly<OpenAdmissionDisposition>> {
    const completion=this.#tail.then(async()=>{entry.observation=await decide();return entry.observation;});
    entry.completion=completion;
    this.#tail=completion.then(()=>undefined);
    return completion;
  }

  /** A lookup neither reserves an identity nor establishes settlement for an absent ID. */
  status(identity:OpenAttemptIdentity):Readonly<OpenAdmissionDisposition> {
    const invalid=this.#check(identity);
    return invalid??this.#entries.get(identity.attemptId)?.observation??this.#unknown(identity,'NOT_FOUND');
  }

  /**
   * Refusals without a registry record (capacity, epoch, malformed/conflicting input)
   * are UNKNOWN request-level observations, not protective terminal dispositions.
   * A conflict never replaces the original attempt's record.
   */
  admit(request:OpenAdmissionInput):Promise<Readonly<OpenAdmissionDisposition>> {
    const identity=this.#identity(request),invalid=this.#check(identity);
    if(invalid)return Promise.resolve(invalid);
    if(!token(request.originatingGeneration)||typeof request.payload!=='string'
      ||request.payload.length>this.#maxPayloadCharacters)return Promise.resolve(this.#unknown(identity,'INVALID_INPUT'));
    const existing=this.#entries.get(identity.attemptId);
    if(existing){
      if(existing.input&&(existing.input.payload!==request.payload
        ||existing.input.originatingGeneration!==request.originatingGeneration))
        return Promise.resolve(this.#unknown(identity,'IDENTITY_CONFLICT'));
      return existing.completion;
    }
    // Copy before queuing: caller mutation cannot change the bound generation/payload.
    const input=Object.freeze({...identity,originatingGeneration:request.originatingGeneration,payload:request.payload});
    const entry=this.#reserve(identity,input);
    if(!entry)return Promise.resolve(this.#unknown(identity,'CAPACITY_EXHAUSTED'));
    return this.#queue(entry,async()=>{
      if(this.#authorityUncertain)return this.#reject(identity,'AUTHORITY_UNCERTAIN');
      try{
        const before=this.#generation();
        if(!token(before))throw new Error('Generation unavailable.');
        if(before!==input.originatingGeneration)return this.#reject(identity,'STALE_GENERATION');
        const result=await this.#activate(input),after=this.#generation();
        if(result?.status==='ADMITTED'&&token(result.projectId)&&token(result.activatedGeneration)
          &&result.activatedGeneration!==before&&after===result.activatedGeneration)
          return Object.freeze({...identity,status:'ADMITTED',projectId:result.projectId,activatedGeneration:result.activatedGeneration});
        if(result?.status==='REJECTED_BEFORE_ACTIVATION'&&result.reason==='VALIDATION_REJECTED'&&after===before)
          return this.#reject(identity,'VALIDATION_REJECTED');
      }catch{
        // No raw adapter errors/payloads leave this boundary; failure may follow activation.
      }
      this.#authorityUncertain=true;
      return this.#unknown(identity,'ACTIVATION_UNCERTAIN');
    });
  }

  /**
   * Submission order is authoritative. An earlier admission gets its decision first;
   * settlement cannot interrupt an already-started activation or roll it back.
   * An earlier settlement reserves the identity immediately, preventing late admit.
   */
  settle(request:OpenAttemptIdentity):Promise<Readonly<OpenAdmissionDisposition>> {
    const identity=this.#identity(request),invalid=this.#check(identity);
    if(invalid)return Promise.resolve(invalid);
    const existing=this.#entries.get(identity.attemptId);
    if(existing)return existing.completion;
    const entry=this.#reserve(identity);
    if(!entry)return Promise.resolve(this.#unknown(identity,'CAPACITY_EXHAUSTED'));
    return this.#queue(entry,async()=>this.#reject(identity,'SETTLED_BEFORE_ARRIVAL'));
  }
}
