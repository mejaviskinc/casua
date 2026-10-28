import deploymentConnection from './connection.json';
import {randomId} from './domain.mjs';
import {createClient} from '@supabase/supabase-js';
const key='causa-connection-v1';
export function getConfig(){try{return JSON.parse(localStorage.getItem(key))||{url:import.meta.env.VITE_SUPABASE_URL||deploymentConnection.url||'',key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||deploymentConnection.key||''}}catch{return {url:'',key:''}}}
export function saveConfig(config){localStorage.setItem(key,JSON.stringify(config));location.reload()}
const config=getConfig();
let client=null;try{if(config.url&&config.key)client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}catch{}
export const db=client;
export async function rpc(name,args={}){if(!db)throw new Error('Hubungkan Supabase terlebih dahulu.');const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
export async function query(table){if(!db)throw Error('Database belum terhubung.');let rows=[],offset=0;while(true){const {data,error}=await db.from(table).select('*').order('id').range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;offset+=1000;}return rows;}
export async function upload(file,bucket='menu-images'){if(!db)throw new Error('Database belum terhubung.');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Gunakan JPG, PNG, atau WebP maksimal 5 MB.');const path=randomId()+'.'+file.name.split('.').pop().toLowerCase();const {error}=await db.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;}
