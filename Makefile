# Chore Coin build matrix
#
# Two-stage build: (1) Vite compiles the PWA frontend into frontend/dist/,
# (2) go build embeds that dist plus pb_hooks/ and pb_migrations/ into the
# chorecoin binary. The `build` target orchestrates both; the release matrix
# cross-compiles the same fully-embedded artifact for macOS + Linux (arm64,
# amd64, and armv7 for older Pis).
#
# CGO is disabled everywhere so PocketBase uses the pure-Go modernc.org/sqlite
# driver — no C toolchain needed on the build host, cross-compile from any OS.

BIN     := chorecoin
PKG     := ./cmd/chorecoin
BINDIR  := bin
FRONTEND_DIR := frontend
FRONTEND_DIST := $(FRONTEND_DIR)/dist
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
GO      ?= go
NPM     ?= npm

# Unset NODE_ENV inside recipes so `npm install` always includes devDependencies
# (Vite, TypeScript, etc.) even when the surrounding shell has NODE_ENV=production.
export NODE_ENV :=

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z0-9_.-]+:.*?##/ {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: frontend
frontend: ## Build the Vite frontend into frontend/dist/
	cd $(FRONTEND_DIR) && test -d node_modules || $(NPM) install --include=dev
	cd $(FRONTEND_DIR) && $(NPM) run build

.PHONY: frontend-clean
frontend-clean: ## Remove built frontend + node_modules
	rm -rf $(FRONTEND_DIST) $(FRONTEND_DIR)/node_modules

.PHONY: build
build: frontend ## Build for the host platform (frontend + binary)
	CGO_ENABLED=0 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN) $(PKG)

.PHONY: darwin-arm64
darwin-arm64: frontend ## Build for macOS Apple Silicon (M1/M2/M3/M4)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-darwin-arm64 $(PKG)

.PHONY: darwin-amd64
darwin-amd64: frontend ## Build for macOS Intel
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-darwin-amd64 $(PKG)

.PHONY: linux-arm64
linux-arm64: frontend ## Build for Linux ARM64 (Raspberry Pi 4/5/Zero 2W, generic ARM servers)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-arm64 $(PKG)

.PHONY: linux-amd64
linux-amd64: frontend ## Build for Linux x86_64 (most VPS providers)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-amd64 $(PKG)

.PHONY: linux-armv7
linux-armv7: frontend ## Build for older 32-bit Raspberry Pis (Pi 2/3, Zero W)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-armv7 $(PKG)

.PHONY: release
release: darwin-arm64 darwin-amd64 linux-arm64 linux-amd64 linux-armv7 ## Build all release targets
	@ls -lh $(BINDIR)/

.PHONY: run
run: build ## Build and run against local pb_hooks + pb_migrations, data in /tmp/chorecoin-dev
	@mkdir -p /tmp/chorecoin-dev
	./$(BINDIR)/$(BIN) serve --http=127.0.0.1:18090 --dir=/tmp/chorecoin-dev

.PHONY: demo
demo: build ## Fresh instance for demo/screenshots — wipes /tmp/chorecoin-demo, starts server, prints wizard credentials
	@rm -rf /tmp/chorecoin-demo && mkdir -p /tmp/chorecoin-demo
	@printf '\n\033[1m🪙  Chore Coin demo instance\033[0m\n\n'
	@printf '  1. Open http://127.0.0.1:18090 in your browser\n'
	@printf '  2. Complete the setup wizard with these credentials:\n\n'
	@printf '       License key:     CHRC-DEMO-DEMO-DEMO-DEMO\n'
	@printf '       Admin email:     admin@demo.local\n'
	@printf '       Admin password:  demoadminpass123\n'
	@printf '       Parent name:     Jordan\n'
	@printf '       Parent email:    jordan@demo.local\n'
	@printf '       Parent password: demopassword\n\n'
	@printf '  3. Once the wizard finishes, run in another terminal:\n\n'
	@printf '       make demo-data\n\n'
	@printf '  Ctrl+C here when you are done to shut the server down.\n\n'
	./$(BINDIR)/$(BIN) serve --http=127.0.0.1:18090 --dir=/tmp/chorecoin-demo

.PHONY: demo-data
demo-data: ## Seed the demo instance with the Rivera family (assumes `make demo` is running + wizard done)
	@BASE_URL=http://127.0.0.1:18090 \
	 PARENT_EMAIL=jordan@demo.local \
	 PARENT_PASSWORD=demopassword \
	 ./scripts/seed-demo.sh

.PHONY: clean
clean: ## Remove built binaries (keeps node_modules; use frontend-clean to nuke that too)
	rm -rf $(BINDIR)/

.PHONY: tidy
tidy: ## Run go mod tidy
	$(GO) mod tidy
