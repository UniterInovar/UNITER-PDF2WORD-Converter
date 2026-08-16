export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  appTitle: process.env.VITE_APP_TITLE ?? "UNITER document converter",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Default to 10 GiB to support very large conversion jobs; override with DOC_CONVERTER_MAX_FILE_BYTES.
  conversionMaxFileBytes: Number(process.env.DOC_CONVERTER_MAX_FILE_BYTES ?? 10 * 1024 * 1024 * 1024),
  pythonExecutable: process.env.DOC_CONVERTER_PYTHON ?? "python3",
  libreOfficeExecutable: process.env.DOC_CONVERTER_SOFFICE ?? "soffice",
  // Maximum time (ms) to allow external conversion processes to run before force-killing them.
  conversionProcessTimeoutMs: Number(process.env.DOC_CONVERTER_PROCESS_TIMEOUT_MS ?? 300000),
};
