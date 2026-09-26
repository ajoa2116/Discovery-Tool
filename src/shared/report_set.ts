import {Device} from '../types/index.ts';
export interface ReportMember {id:string;device:Device;addedAt:string;updatedAt:string;current:boolean;currentDeviceId?:string;macLastSix?:string;}
export interface ReportSetSnapshot {members:ReportMember[];}
