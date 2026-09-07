import { isFirestoreBackend } from '../config/database.js';
import * as firestoreDb from './firestoreDb.js';
import * as mysqlDb from './mysqlDb.js';
import * as memoryDb from './memoryDb.js';

let isMysqlAvailable = true;
const runtimeEnvironment = String(process.env.DEPLOY_ENV || process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
const isProductionRuntime = runtimeEnvironment === 'production' || !!process.env.K_SERVICE;
const isStagingRuntime = ['staging', 'stage'].includes(String(
  process.env.DEPLOY_ENV || process.env.APP_ENV || process.env.NODE_ENV || ''
).trim().toLowerCase());
// A memory fallback is useful for an explicitly isolated staging deployment,
// but it must never turn a production database outage into a successful write
// against a different datastore.
const allowMemoryFallback = !isProductionRuntime
  && isStagingRuntime
  && process.env.DB_FALLBACK_MEMORY === 'true';

if (isProductionRuntime && process.env.DB_DRIVER === 'memory') {
  throw new Error('DB_DRIVER=memory is only permitted for an explicit non-production staging runtime.');
}

const primaryDb = process.env.DB_DRIVER === 'memory'
  ? memoryDb
  : (isFirestoreBackend() ? firestoreDb : mysqlDb);

const handler = {
  get(target, prop) {
    const primaryFn = primaryDb[prop];
    const fallbackFn = memoryDb[prop];

    if (typeof primaryFn !== 'function') {
      return allowMemoryFallback ? (fallbackFn || primaryFn) : primaryFn;
    }

    return async function (...args) {
      if (allowMemoryFallback && !isMysqlAvailable && fallbackFn) {
        return fallbackFn(...args);
      }
      try {
        return await primaryFn(...args);
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
          if (allowMemoryFallback && isMysqlAvailable) {
            console.warn(`[DB] MySQL indisponível (${err.code}). Alternando automaticamente para o banco local resiliente (JSON/Memory).`);
            isMysqlAvailable = false;
          }
          if (allowMemoryFallback && fallbackFn) {
            return fallbackFn(...args);
          }
        }
        throw err;
      }
    };
  },
};

const dbProxy = new Proxy(primaryDb, handler);

export default dbProxy;

export const userFindById = (...a) => dbProxy.userFindById(...a);
export const userFindByEmail = (...a) => dbProxy.userFindByEmail(...a);
export const userCreate = (...a) => dbProxy.userCreate(...a);
export const userUpdate = (...a) => dbProxy.userUpdate(...a);
export const userDelete = (...a) => dbProxy.userDelete(...a);
export const purgeNonAdminUsers = (...a) => dbProxy.purgeNonAdminUsers(...a);
export const userList = (...a) => dbProxy.userList(...a);
export const userCount = (...a) => dbProxy.userCount(...a);
export const userFindByResetToken = (...a) => dbProxy.userFindByResetToken(...a);
export const categoryFindById = (...a) => dbProxy.categoryFindById(...a);
export const categoryFindBySlug = (...a) => dbProxy.categoryFindBySlug(...a);
export const categorySlugExists = (...a) => dbProxy.categorySlugExists(...a);
export const categoryListAll = (...a) => dbProxy.categoryListAll(...a);
export const categoryChildren = (...a) => dbProxy.categoryChildren(...a);
export const categoryCreate = (...a) => dbProxy.categoryCreate(...a);
export const categoryUpdate = (...a) => dbProxy.categoryUpdate(...a);
export const categoryDelete = (...a) => dbProxy.categoryDelete(...a);
export const categoryGetDescendantIds = (...a) => dbProxy.categoryGetDescendantIds(...a);
export const categoryListWithCounts = (...a) => dbProxy.categoryListWithCounts(...a);
export const resourceFindById = (...a) => dbProxy.resourceFindById(...a);
export const resourceFindBySlug = (...a) => dbProxy.resourceFindBySlug(...a);
export const resourceSlugExists = (...a) => dbProxy.resourceSlugExists(...a);
export const resourceCreate = (...a) => dbProxy.resourceCreate(...a);
export const resourceUpdate = (...a) => dbProxy.resourceUpdate(...a);
export const resourceDelete = (...a) => dbProxy.resourceDelete(...a);
export const resourceIncrementViews = (...a) => dbProxy.resourceIncrementViews(...a);
export const resourceIncrementDownloads = (...a) => dbProxy.resourceIncrementDownloads(...a);
export const resourceAdminList = (...a) => dbProxy.resourceAdminList(...a);
export const resourceListFiltered = (...a) => dbProxy.resourceListFiltered(...a);
export const fileFindById = (...a) => dbProxy.fileFindById(...a);
export const fileFindByIdAndResource = (...a) => dbProxy.fileFindByIdAndResource(...a);
export const filesByResource = (...a) => dbProxy.filesByResource(...a);
export const fileCreate = (...a) => dbProxy.fileCreate(...a);
export const fileUpdate = (...a) => dbProxy.fileUpdate(...a);
export const fileDelete = (...a) => dbProxy.fileDelete(...a);
export const fileMaxSortOrder = (...a) => dbProxy.fileMaxSortOrder(...a);
export const fileClearBundleFlags = (...a) => dbProxy.fileClearBundleFlags(...a);
export const settingsGetAll = (...a) => dbProxy.settingsGetAll(...a);
export const settingsGetByKeys = (...a) => dbProxy.settingsGetByKeys(...a);
export const settingsUpsert = (...a) => dbProxy.settingsUpsert(...a);
export const settingsSeed = (...a) => dbProxy.settingsSeed(...a);
export const editorRevisionGet = (...a) => dbProxy.editorRevisionGet(...a);
export const editorRevisionBump = (...a) => dbProxy.editorRevisionBump(...a);
export const downloadCreate = (...a) => dbProxy.downloadCreate(...a);
export const downloadReserve = (...a) => dbProxy.downloadReserve(...a);
export const downloadFinalize = (...a) => dbProxy.downloadFinalize(...a);
export const downloadComplete = (...a) => dbProxy.downloadComplete(...a);
export const downloadRelease = (...a) => dbProxy.downloadRelease(...a);
export const downloadIntentCreate = (...a) => dbProxy.downloadIntentCreate(...a);
export const downloadIntentRecent = (...a) => dbProxy.downloadIntentRecent(...a);
export const downloadsByUser = (...a) => dbProxy.downloadsByUser(...a);
export const downloadCountByUser = (...a) => dbProxy.downloadCountByUser(...a);
export const downloadCount = (...a) => dbProxy.downloadCount(...a);
export const downloadRecent = (...a) => dbProxy.downloadRecent(...a);
export const downloadReport = (...a) => dbProxy.downloadReport(...a);
export const favoriteListByUser = (...a) => dbProxy.favoriteListByUser(...a);
export const favoriteIdsByUser = (...a) => dbProxy.favoriteIdsByUser(...a);
export const favoriteAdd = (...a) => dbProxy.favoriteAdd(...a);
export const favoriteRemove = (...a) => dbProxy.favoriteRemove(...a);
export const favoriteFolderListByUser = (...a) => dbProxy.favoriteFolderListByUser(...a);
export const favoriteFolderCreate = (...a) => dbProxy.favoriteFolderCreate(...a);
export const favoriteFolderEnsureDefault = (...a) => dbProxy.favoriteFolderEnsureDefault(...a);
export const planFindPremium = (...a) => dbProxy.planFindPremium(...a);
export const planFindBySlug = (...a) => dbProxy.planFindBySlug(...a);
export const planCreatePremium = (...a) => dbProxy.planCreatePremium(...a);
export const planCreateFromConfig = (...a) => dbProxy.planCreateFromConfig(...a);
export const subscriptionHasActive = (...a) => dbProxy.subscriptionHasActive(...a);
export const subscriptionGetStatus = (...a) => dbProxy.subscriptionGetStatus(...a);
export const subscriptionCancelActive = (...a) => dbProxy.subscriptionCancelActive(...a);
export const subscriptionActivate = (...a) => dbProxy.subscriptionActivate(...a);
export const subscriptionActiveTier = (...a) => dbProxy.subscriptionActiveTier(...a);
export const subscriptionListNeedingReminder = (...a) => dbProxy.subscriptionListNeedingReminder(...a);
export const subscriptionMarkReminderSent = (...a) => dbProxy.subscriptionMarkReminderSent(...a);
export const pageViewCreate = (...a) => dbProxy.pageViewCreate(...a);
export const pageViewStats = (...a) => dbProxy.pageViewStats(...a);
export const interactionEventCreate = (...a) => dbProxy.interactionEventCreate(...a);
export const interactionEventStats = (...a) => dbProxy.interactionEventStats(...a);
export const contactMessageCreate = (...a) => dbProxy.contactMessageCreate(...a);
export const contactMessageList = (...a) => dbProxy.contactMessageList(...a);
export const contactMessageUpdate = (...a) => dbProxy.contactMessageUpdate(...a);
export const contactMessageDelete = (...a) => dbProxy.contactMessageDelete(...a);
export const userSignupSourceStats = (...a) => dbProxy.userSignupSourceStats(...a);
export const resourceTopByDownloads = (...a) => dbProxy.resourceTopByDownloads(...a);
export const storageUpload = (...a) => dbProxy.storageUpload(...a);
export const storageDownloadStream = (...a) => dbProxy.storageDownloadStream(...a);
export const storageDelete = (...a) => dbProxy.storageDelete(...a);
export const storageCopy = (...a) => dbProxy.storageCopy(...a);
export const storageStat = (...a) => dbProxy.storageStat(...a);
export const resourceCoverReferenceCount = (...a) => dbProxy.resourceCoverReferenceCount(...a);
export const editorUploadSessionCreate = (...a) => dbProxy.editorUploadSessionCreate(...a);
export const editorUploadSessionFind = (...a) => dbProxy.editorUploadSessionFind(...a);
export const editorUploadSessionUpdate = (...a) => dbProxy.editorUploadSessionUpdate(...a);
export const editorUploadSessionDelete = (...a) => dbProxy.editorUploadSessionDelete(...a);
export const editorUploadSessionListExpired = (...a) => dbProxy.editorUploadSessionListExpired(...a);
export const localPathToStorage = (...a) => dbProxy.localPathToStorage(...a);
export const withTransaction = (work) => dbProxy.withTransaction(work);
export const setCounter = (...a) => dbProxy.setCounter(...a);
export const importDoc = (...a) => dbProxy.importDoc(...a);
export const stripeWebhookEventClaim = (...a) => dbProxy.stripeWebhookEventClaim(...a);
export const stripeWebhookEventComplete = (...a) => dbProxy.stripeWebhookEventComplete(...a);
export const stripeWebhookEventRelease = (...a) => dbProxy.stripeWebhookEventRelease(...a);
export const COL = primaryDb.COL || {};
