export type AccountId = "owner" | "partner";

export type Account = {
  id: AccountId;
  username: string;
  displayName: string;
  passwordHash: string;
};

export function getAccounts(): Account[] {
  return [
    {
      id: "owner",
      username: process.env.XULIU_OWNER_USERNAME ?? "owner",
      displayName: process.env.XULIU_OWNER_DISPLAY_NAME ?? "我的空间",
      passwordHash: process.env.XULIU_OWNER_PASSWORD_HASH ?? "",
    },
    {
      id: "partner",
      username: process.env.XULIU_PARTNER_USERNAME ?? "partner",
      displayName: process.env.XULIU_PARTNER_DISPLAY_NAME ?? "另一位成员",
      passwordHash: process.env.XULIU_PARTNER_PASSWORD_HASH ?? "",
    },
  ];
}

export function publicAccount(account: Account) {
  return { id: account.id, username: account.username, displayName: account.displayName };
}

export function findAccountByUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  return getAccounts().find((account) => account.username.toLowerCase() === normalized);
}

export function findAccountById(id: string) {
  return getAccounts().find((account) => account.id === id);
}
