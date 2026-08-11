# Chore Coin build matrix
#
# Cross-compilation targets: macOS (arm64/amd64) and Linux (arm64/amd64/armv7)
# so the binary runs on Apple Silicon, Intel Macs, x86 Linux servers, and every
# Raspberry Pi from Zero 2W through Pi 5. CGO is disabled so PocketBase uses
# the pure-Go modernc.org/sqlite driver — no C toolchain needed for cross-
# builds, everything works from any host.

BIN     := chorecoin
PKG     := ./cmd/chorecoin
BINDIR  := bin
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
GO      ?= go

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z0-9_.-]+:.*?##/ {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: build
build: ## Build for the host platform (auto-detects OS/arch)
	CGO_ENABLED=0 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN) $(PKG)

.PHONY: darwin-arm64
darwin-arm64: ## Build for macOS Apple Silicon (M1/M2/M3/M4)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-darwin-arm64 $(PKG)

.PHONY: darwin-amd64
darwin-amd64: ## Build for macOS Intel
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-darwin-amd64 $(PKG)

.PHONY: linux-arm64
linux-arm64: ## Build for Linux ARM64 (Raspberry Pi 4/5/Zero 2W, generic ARM servers)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-arm64 $(PKG)

.PHONY: linux-amd64
linux-amd64: ## Build for Linux x86_64 (most VPS providers)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-amd64 $(PKG)

.PHONY: linux-armv7
linux-armv7: ## Build for older 32-bit Raspberry Pis (Pi 2/3, Zero W)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 $(GO) build -ldflags="$(LDFLAGS)" -o $(BINDIR)/$(BIN)-linux-armv7 $(PKG)

.PHONY: release
release: darwin-arm64 darwin-amd64 linux-arm64 linux-amd64 linux-armv7 ## Build all release targets
	@ls -lh $(BINDIR)/

.PHONY: run
run: build ## Build and run against local pb_hooks + pb_migrations, data in /tmp/chorecoin-dev
	@mkdir -p /tmp/chorecoin-dev
	./$(BINDIR)/$(BIN) serve --http=127.0.0.1:18090 --dir=/tmp/chorecoin-dev

.PHONY: clean
clean: ## Remove built binaries
	rm -rf $(BINDIR)/

.PHONY: tidy
tidy: ## Run go mod tidy
	$(GO) mod tidy
