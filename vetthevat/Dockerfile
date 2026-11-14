# Supply an approved official Node 22 Debian image PINNED BY DIGEST.
# No default tag: callers must make their base-image choice explicit.
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS checks
COPY . .
RUN npm test
ENV VETTHEVAT_BUILD_STANDALONE=1
RUN npm run build && npm run typecheck

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=checks --chown=node:node /app/.next/standalone ./
COPY --from=checks --chown=node:node /app/.next/static ./.next/static
COPY --from=checks --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
