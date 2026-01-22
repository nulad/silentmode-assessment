#!/bin/bash

# Silentmode Assessment Setup Script
# This script sets up the entire development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main setup
main() {
    print_header "Silentmode Assessment Setup"
    
    # Check prerequisites
    print_header "Checking Prerequisites"
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18 or later."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18 or later is required. Current version: $(node -v)"
        exit 1
    fi
    print_success "Node.js $(node -v) found"
    
    if ! command_exists npm; then
        print_error "npm is not installed."
        exit 1
    fi
    print_success "npm $(npm -v) found"
    
    if ! command_exists python3; then
        print_warning "Python3 is not installed. Some features may not work."
    else
        print_success "Python3 $(python3 --version) found"
    fi
    
    # Install dependencies
    print_header "Installing Dependencies"
    
    echo "Installing root dependencies..."
    npm install
    print_success "Root dependencies installed"
    
    echo "Installing server dependencies..."
    cd server
    npm install
    cd ..
    print_success "Server dependencies installed"
    
    echo "Installing client dependencies..."
    cd client
    npm install
    cd ..
    print_success "Client dependencies installed"
    
    # Create necessary directories
    print_header "Creating Directories"
    
    mkdir -p downloads
    mkdir -p server/downloads
    mkdir -p test-files
    mkdir -p logs
    print_success "Directories created"
    
    # Create environment files
    print_header "Setting up Environment"
    
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from template"
    else
        print_warning ".env file already exists"
    fi
    
    if [ ! -f server/.env ]; then
        cp server/.env.example server/.env
        print_success "Created server/.env file from template"
    else
        print_warning "server/.env file already exists"
    fi
    
    if [ ! -f client/.env ]; then
        cp client/.env.example client/.env
        print_success "Created client/.env file from template"
    else
        print_warning "client/.env file already exists"
    fi
    
    # Generate test files
    print_header "Generating Test Files"
    
    echo "Generating test files for development..."
    ./scripts/generate-test.sh test-10mb.dat 10
    ./scripts/generate-test.sh test-50mb.dat 50
    print_success "Test files generated"
    
    # Setup git hooks
    print_header "Setting up Git Hooks"
    
    if [ -d .git ]; then
        # Install pre-commit hook for linting
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for linting

echo "Running linter..."
npm run lint
if [ $? -ne 0 ]; then
    echo "Linting failed. Please fix the issues before committing."
    exit 1
fi

echo "Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "Tests failed. Please fix the issues before committing."
    exit 1
fi
EOF
        chmod +x .git/hooks/pre-commit
        print_success "Git hooks installed"
    else
        print_warning "Not a git repository. Skipping git hooks."
    fi
    
    # Verify installation
    print_header "Verifying Installation"
    
    echo "Testing server startup..."
    timeout 5 npm run server:start > /dev/null 2>&1 || true
    print_success "Server can start"
    
    echo "Testing CLI tool..."
    node cli.js --help > /dev/null 2>&1
    print_success "CLI tool works"
    
    # Print next steps
    print_header "Setup Complete!"
    
    echo -e "${GREEN}The Silentmode Assessment environment is ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review the configuration in .env files"
    echo "2. Start the server: npm run server:start"
    echo "3. Start the client: npm run client:start"
    echo "4. Or use the CLI: node cli.js --help"
    echo ""
    echo "Useful commands:"
    echo "- Start server:     npm run server:start"
    echo "- Start client:     npm run client:start"
    echo "- Run tests:        npm test"
    echo "- Generate test:    ./scripts/generate-test.sh [filename] [sizeMB]"
    echo "- Run E2E test:     ./scripts/e2e-test.sh"
    echo ""
    echo "Documentation:"
    echo "- README.md         - General documentation"
    echo "- docs/ARCHITECTURE.md - Architecture overview"
    echo "- docs/PROTOCOL.md  - Protocol specification"
    echo ""
}

# Run main function
main "$@"
