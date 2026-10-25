# 反差动物人格：独立部署版

前端是 React + Vite 静态网站，源码存放 GitHub，正式前端目标为 Netlify，后端为 Supabase Edge Functions + PostgreSQL。顾客不需注册；店主管理后台单独登录。

保留 24 道情境题、12 种动物、144 种组合、完整报告、返回改选、保存长图、复制结果链接、再测一次和好评有礼。密码只能生成 3 份报告，保存/分享/重试不会重复扣次。

## 本地开发

需要 Node 22.13+（推荐 Node 24）。执行 `npm ci`，按 `.env.example` 创建 `.env.local`，再执行 `npm run dev`。`npm test` 验证题目、报告、数据库权限和真实 Edge 请求处理逻辑。`npm run build` 运行类型检查并生成 `dist/`。

Supabase 的项目 URL 和 publishable/anon key 是公开配置。service_role/secret key、数据库密码、管理员 JWT、顾客密码和导出数据绝不能进入源码、前端环境变量或 GitHub。

## 首次上线顺序

1. 登录 GitHub，创建公开仓库并推送此目录。勿上传旧 Sites 目录、`.env`、`work/` 或任何导出数据。
2. 登录 Supabase，在自己的组织中创建独立项目，先选 Free。已有生产项目需先核对，不能直接覆盖。保存数据库密码到自己的密码管理工具。
3. 应用 `supabase/migrations/202610250001_animal.sql`。可使用 Supabase 连接的迁移工具，或 CLI：`supabase link --project-ref <项目标识>`、`supabase db push`。不要重置数据库。
4. Supabase Edge Secrets 设置 `ADMIN_EMAIL` 为已授权的管理员邮箱、`RATE_LIMIT_SALT` 为随机 32 字节密钥；`ALLOWED_ORIGINS` 稍后设置为实际 Netlify 网站的精确来源，如 `https://example.netlify.app`。Supabase 自动提供服务端项目 URL 和 service_role key，不需要放入 GitHub。
5. `npm run sync:edge` 后执行 `supabase functions deploy animal-api`。`verify_jwt=false` 是因为公开报告和店铺密码不使用 Supabase 用户 JWT；Edge 内对店主 JWT 调用 `/auth/v1/user` 验证，对测评请求验证独立随机会话。所有应用表开启 RLS 且匿名/普通账户无直接读写权限；RPC 只授予 service_role。
6. 登录 Netlify（可使用 GitHub 账户）。选择免费方案，从 GitHub 导入此仓库。构建命令 `npm run build`，发布目录 `dist`，Node 24。设置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，两者均为公开参数。无需设置任何服务端密钥。
7. 获得固定网站 URL 后，更新 Edge Secret `ALLOWED_ORIGINS`。在 Supabase Authentication / URL Configuration 设置 Site URL 和允许的重定向 URL 为精确站点首页，例如 `https://example.netlify.app/`。发布使用 HTTPS。
8. 在 Supabase Auth 创建已确认的店主管理账户，邮箱必须与 ADMIN_EMAIL 一致。关闭公开注册以减少无关账户。后台登录页 `https://example.netlify.app/#/admin` 发送已有账户的登录邮件；在发起登录的同一浏览器打开邮件链接。它使用邮箱链接登录，不依赖 ChatGPT 登录或 Google OAuth。
9. Supabase 默认发信服务有收件人/频率限制，部署时验证管理邮箱能收到邮件。若邮箱不属于项目允许的成员，配置自己的 SMTP 后再验收登录。切勿将 Supabase 控制台登录与网站 Auth 用户混为一谈。
10. 上线检查包括真实四会话同时提交、三次配额、重复提交、跨设备查看、匿名分享和图片保存。`npm run test:integration` 是针对已部署后端的检查，需在本机进程环境注入 TEST_SUPABASE_URL、TEST_SUPABASE_PUBLIC_KEY 和短期 TEST_ADMIN_JWT；会生成并停用一个验收密码。

## 旧站数据迁移与切换

旧站暂时保持现状。正式切换前，应先让旧站停止新增密码及扣次提交，再完整导出 access_codes、access_sessions、attempts、results；不得使用截断分页。复制后冻结旧站写入，避免同一密码在两个数据库分别获得额度。切换完成后旧站保留结果读取或指向新站。

把完整表数组以 JSON 标准输入传入 `node scripts/legacy-import.mjs`，产生私有 `work/legacy-import.sql`。仅应用到新的空业务表；脚本使用单个事务保存原来的密码哈希、已用次数、结果 ID、答案和时间。已存在数据时会拒绝重复插入，避免不知情覆盖。旧会话不会跨域转移，顾客在新站重新输入原密码即可；原结果 ID 可用于新站结果链接。旧域名链接仍依赖旧站服务存续。

## 运维

修改题目或评分后，必须执行 `npm run sync:edge` 并同时部署前端与 Edge；CI 会检测前后端题库一致。Netlify 连接 GitHub 后自动构建前端；后端迁移和函数更新需单独部署。新增数据库迁移，勿修改已经应用的旧迁移文件。

Supabase Free 连续一周无活动可能暂停，需要到控制台恢复。Free 适合初期验收，不承诺一直在线；长期经营可评估 Pro。Netlify 免费套餐也有使用限额，达到限额时可能暂停。项目不创建保活任务、不自动购买套餐。

新结果链接采用 `/#/result/<随机ID>`，适用于静态托管，刷新不需要服务器路由。链接持有人可以查看报告，所以不要把它当作私密存储；匿名页面不显示原始答案、答题场景和密码。手机通过系统分享或长按生成图保存；浏览器能否直接写相册取决于系统授权，电脑支持 PNG 下载。
