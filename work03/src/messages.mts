/**
 * ========================
 * メッセージ定義
 * ========================
 */
export const Messages = {
  // ------------------------
  // Usage メッセージ
  // ------------------------
  usage: {
    init: 'Usage: node pwman.mts init [--master <masterPassword>]',
    add: 'Usage: node pwman.mts add <service> <username> <password> [--master <masterPassword>]',
    get: 'Usage: node pwman.mts get <service> <username> [--master <masterPassword>]',
    del: 'Usage: node pwman.mts del <service> <username> [--master <masterPassword>]',
    list: 'Usage: node pwman.mts list [--asc service|username] [--desc service|username]',
    export: 'Usage: node pwman.mts export <csvFilePath> [--master <masterPassword>]',
    import: 'Usage: node pwman.mts import <csvFilePath> [--master <masterPassword>]',
    changeMaster: 'Usage: node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]',
    status: 'Usage: node pwman.mts status',
    help: `Usage:
    node pwman.mts init [--master <masterPassword>]
    node pwman.mts add <service> <username> <password> [--master <masterPassword>]
    node pwman.mts get <service> <username> [--master <masterPassword>]
    node pwman.mts del <service> <username> [--master <masterPassword>]
    node pwman.mts list [--asc service|username] [--desc service|username]
    node pwman.mts export <csvFilePath> [--master <masterPassword>]
    node pwman.mts import <csvFilePath> [--master <masterPassword>]
    node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]
    node pwman.mts status`,
  },

  // ------------------------
  // エラーメッセージ
  // ------------------------
  errors: {
    dbNotInitialized: 'Error: DB is not initialized. Please run init first.',
    dbAlreadyInitialized: 'Error: DB already initialized.',
    authFailed: 'Error: Authentication failed.',
    masterNotSet: 'Error: Master password not set.',
    invalidOldMaster: 'Error: invalid old master password.',
    pwMismatch: 'Error: new master passwords do not match.',
    emptyPassword: 'Error: Password cannot be empty.',
    entryNotFound: 'Error: Entry not found.',
    ioError: 'Error: I/O or DB error.',
    unknownOption: (opt: string) => `Error: unknown option ${opt}`,
    unexpectedArg: (arg: string) => `Error: unexpected argument ${arg}`,
    controlChar: 'Error: control characters are not allowed.',

    changeMasterFailed: 'Error: change-master failed',

    // CSV関連
    invalidImportFile: (line?: number, msg?: string) =>
      line
        ? `Error: invalid import file at line ${line}: ${msg ?? ''}`
        : `Error: invalid import file ${msg ?? ''}`,
    exportTargetDir: 'Error: export target must be a file path, not a directory.',
    exportDirNotExist: (dir: string) => `Error: output directory does not exist: ${dir}`,
    csvCannotGenerateNewFileName: (filePath: string) =>
    `Error: could not generate new file name: ${filePath}`,
    
    invalidImportLine: (line: number) => `Error: invalid import line at ${line}`,
    invalidImportFormat: 'Error: invalid import format',
    importFailed: 'Error: import failed',
    csvExtensionRequired: (label: 'export' | 'import', ext: string, filePath: string) =>
    `Error: ${label} target must end with "${ext}": ${filePath}`,

    csvImportFileNotFound: (filePath: string) =>
    `Error: import file not found: ${filePath}`,

    csvImportSourceIsDirectory: (filePath: string) =>
    `Error: import source is a directory: ${filePath}`,

    csvBomNotAllowed: (filePath: string) =>
    `Error: invalid CSV (BOM not allowed; only pwman-exported CSV is supported): ${filePath}`,

    csvCrlfNotAllowed: (filePath: string) =>
    `Error: invalid CSV (CRLF not allowed; only pwman-exported CSV is supported): ${filePath}`,

    csvEmpty: (filePath: string) =>
    `Error: invalid CSV (empty): ${filePath}`,

    csvInvalidHeader: (expected: string, actual: string) =>
    `Error: invalid CSV header. expected "${expected}", got "${actual}"`,
  },

  // ------------------------
  // 成功・情報メッセージ
  // ------------------------
  infos: {
    dbInitialized: 'DB initialized.',
    entryAdded: (service: string, username: string) => `Added: ${service} ${username}`,
    entryDeleted: 'Deleted.',
    masterUnchanged: 'Info: master password unchanged.',
    masterChanged: 'Success: master password changed.',
    exportCanceled: 'Canceled.',
    exportRenamedTo: (file: string) => `Info: exporting to ${file}`,
    exportSuccess: (file: string) => `Success: Exported to ${file}`,
    importCanceled: 'Canceled.',
    importSuccess: (count: number) => `Success: imported ${count} records.`,
    initializedNo: 'Initialized: no',
    initializedYes: 'Initialized: yes',
    NoData: 'No data.',
  },

  // ------------------------
  // プロンプト用メッセージ
  // ------------------------
  prompts: {
    enterMaster: 'Enter master password: ',
    enterNewMaster: 'Enter new master password: ',
    confirmNewMaster: 'Confirm new master password: ',
    enterOldMaster: 'Enter old master password: ',

    // export先が重複した場合の確認
    confirmExportConflict: (file: string) =>
    `File already exists: ${file}\n` +
    `[o] overwrite  [r] rename  [c] cancel : `,

    // import続行確認 
    confirmImportReplace: (count: number) =>
    `This will REPLACE existing ${count} records. Continue? [y/n]: `,
  },
};