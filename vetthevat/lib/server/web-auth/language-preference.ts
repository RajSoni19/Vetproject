import {ApiError} from "@/lib/server/api-v1";
import {isLocale,type Locale} from "@/lib/i18n/catalog";

export const accountLanguagePreferenceSchemaSha256="376d4ca0e29ee1e461eec58480cf4d66fa453066a31c988553d5e482c4f62224";
export function accountLanguagePreferenceEnabled(env:Readonly<Record<string,string|undefined>>){return env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED==="1"&&env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256===accountLanguagePreferenceSchemaSha256;}
export function localeInput(value:unknown):Locale{if(typeof value!=="string"||!isLocale(value))throw new ApiError(400,"INVALID_REQUEST","Select a supported language.");return value;}
