# Jenkins → Tomcat Deployment: Local POC Plan

**Goal:** Prove locally that pushing code to a Bitbucket branch automatically builds a WAR (frontend bundled inside) and deploys it to Tomcat, using Docker for Jenkins and Tomcat. Once proven, apply the same pipeline to Radvista.

**Assumptions (change if needed)**
- Git hosting: 2 *test* repos on Bitbucket (closest to the real setup). Alternative: a local Gitea container.
- Frontend: Vite + React (fast, similar to OHIF's React/webpack build).
- Backend: Spring Boot 3.x WAR, JDK 17, Tomcat 10.1 (same stack as radvista-lite: Spring Boot 3.4 + `ServletInitializer`).

**Local machine status**
| Tool | Status |
|---|---|
| Docker / Compose | 29.4 / v2.38 ✅ |
| Node | 22.22 ✅ |
| git | 2.43 ✅ |
| Maven | ❌ not installed (not needed: Maven runs inside the Jenkins container) |
| RAM | 15 GB (enough for the POC; the real OHIF build needs ~8–10 GB for Docker) |

---

## 1. Target Architecture

```
 git push ──► Bitbucket test repos ◄── poll every 1 min ── Jenkins (Docker :8081)
                                                             │ 1. checkout backend + frontend
                                                             │ 2. mvn package (builds UI → WAR)
                                                             │ 3. deploy WAR via Tomcat Manager API
                                                             ▼
                                                      Tomcat 10.1 (Docker :8080)
                                                      http://localhost:8080/demo-app/
```

## 2. Folder Layout (inside `Deployment_POC/`)

```
Deployment_POC/
├── PLAN.md                    # this file
├── demo-frontend/             # Repo 1 – Vite + React app
│   ├── package.json
│   ├── vite.config.js         # base: '/demo-app/'
│   ├── run-build.sh           # same role as OHIF run-build.sh, but path-relative
│   └── src/App.jsx            # shows "Hello from Jenkins" + calls /demo-app/api/hello
│
├── demo-backend/              # Repo 2 – Spring Boot WAR
│   ├── pom.xml                # packaging=war, finalName=demo-app, same exec-plugin UI steps as radvista-lite
│   ├── build-ui.sh
│   ├── Jenkinsfile
│   └── src/main/java/com/demo/
│       ├── DemoApplication.java
│       ├── ServletInitializer.java
│       └── HelloController.java   # GET /api/hello → {"version":"...","time":"..."}
│
└── infra/
    ├── docker-compose.yml     # jenkins + tomcat on one network
    ├── jenkins/
    │   ├── Dockerfile         # jenkins/jenkins:lts-jdk17 + Maven 3.9 + Node 22
    │   └── plugins.txt        # git, workflow-aggregator, credentials-binding, nodejs, bitbucket
    └── tomcat/
        ├── Dockerfile         # tomcat:10.1-jdk17 + manager app enabled
        ├── tomcat-users.xml   # 'deployer' user with manager-script role
        ├── context.xml        # allow manager access from other containers (Jenkins)
        └── manager-web.xml    # raise upload limit to 500 MB (needed later for the OHIF WAR)
```

---

## 3. Phases

### Phase 1: Demo apps, built by hand
1. Scaffold `demo-frontend` and confirm `npm run build` produces `dist/`.
2. Scaffold `demo-backend` with a `pom.xml` that mirrors radvista-lite's UI steps:
   - `clean-ui-target`: delete `src/main/resources/static`
   - `build-ui`: run `build-ui.sh ${ui.project.path}`
   - `copy-ui-dist`: copy `dist/` to `src/main/resources/static`
   - `ui.project.path` is a property, so Jenkins can override it with `-Dui.project.path=...`
3. ✅ **Done when:** `target/demo-app.war` exists and contains `WEB-INF/classes/static/index.html`.

### Phase 2: Docker infrastructure
1. Run `cd infra && docker compose up -d --build`
2. Tomcat (`localhost:8080`)
   - `curl -u deployer:<pwd> http://localhost:8080/manager/text/list` responds
   - Deploy the Phase 1 WAR by hand:
     `curl -u deployer:<pwd> -T demo-app.war "http://localhost:8080/manager/text/deploy?path=/demo-app&update=true"`
   - Open `http://localhost:8080/demo-app/`: the UI loads and the API returns JSON
3. Jenkins (`localhost:8081`)
   - Unlock it with `docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`
   - In a test job, check that `java -version`, `mvn -v` and `node -v` all work
4. Volumes: `jenkins_home` (jobs survive restarts) and `tomcat_logs`
5. ✅ **Done when:** a WAR deployed by hand runs in the Tomcat container.

### Phase 3: Bitbucket connection
1. Create 2 test repos in Bitbucket, `demo-frontend` and `demo-backend`, and push the code to them.
2. Add Jenkins credentials:
   - `bitbucket`: username + app password (repo read)
   - `tomcat-manager`: the `deployer` user + password
3. Trigger: `pollSCM('* * * * *')`. Bitbucket Cloud can't reach `localhost`, so webhooks are optional and need an ngrok tunnel to `:8081`.

### Phase 4: Jenkins pipeline (`demo-backend/Jenkinsfile`)
| Stage | Action |
|---|---|
| Checkout | backend into `backend/`, frontend into `frontend/` (branch configurable, default `develop`) |
| Install UI deps | `npm ci` in `frontend/` |
| Build WAR | `mvn -B clean package -Dui.project.path=$WORKSPACE/frontend` |
| Deploy | `curl -T demo-app.war "http://tomcat:8080/manager/text/deploy?path=/demo-app&update=true"` (`tomcat` is the Compose service name) |
| Health check | `curl --retry 10 http://tomcat:8080/demo-app/api/hello` |
| Archive | `archiveArtifacts target/*.war` (keep last 10 for rollback) |

Options: `disableConcurrentBuilds()`, and polling on **both** repos so a push to either one triggers a deploy.

### Phase 5: End-to-end tests
| Test | Expected |
|---|---|
| Change text in `App.jsx` → push frontend | New text visible at `localhost:8080/demo-app/` within ~2 min |
| Change `HelloController` → push backend | API response changes |
| Push a compile error | Build fails, **no deploy**, old version keeps running |
| Redeploy an archived WAR from an earlier build | Rollback works |

### Phase 6: Move to Radvista (after the POC passes)
1. Switch the repo URLs to the real 3 repos: backend, OHIF UI, and the extensions repo checked out into `ui/extensions/radvista-web-ohif-extensions`.
2. Fix the hard-coded paths:
   - `pom.xml`: `ui.project.path` (override from Jenkins)
   - OHIF `run-build.sh`: replace the fixed `cd` and `link-extension` paths with paths relative to the script, and add `set -e`
3. Settle on one Node version (the pom says v24.8.0, the local machine has v22.22.1) and add `.nvmrc`.
4. Give Docker 8–10 GB of memory for the OHIF webpack build (`--max_old_space_size=8096`).
5. Set the Spring profile in Tomcat's `CATALINA_OPTS` (`-Dspring.profiles.active=<env>`) so the same WAR works in every environment.
6. Map branches to environments: e.g. `develop` → dev Tomcat, a release branch → UAT (with a manual approval step). Feature branches only build.

---

## 4. Open Decisions
- [ ] Bitbucket test repos, or a local Gitea container?
- [ ] Vite + React, or a plain HTML page for the demo frontend?
- [ ] (Real setup) Which branch deploys to which Tomcat server?
- [ ] (Real setup) Will Jenkins and Tomcat run on the same host?
