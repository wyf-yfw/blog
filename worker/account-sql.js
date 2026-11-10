function quote(value) {
  return String(value).replaceAll("'", "''");
}

export function buildUserSql(username, passwordHash, createdAt) {
  if (!/^[\w.-]{1,64}$/.test(username)) throw new Error("用户名只允许字母、数字、点、下划线和短横线");
  return [
    "DELETE FROM sessions;",
    "DELETE FROM users;",
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (1, '${username}', '${quote(passwordHash)}', '${quote(createdAt)}');`,
    "",
  ].join("\n");
}
