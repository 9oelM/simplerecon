# simplerecon
Collects all subdomains of (multiple) root domains using a set of tools

## Install

```
git clone thisrepository

npm run build:use

sudo ./install.sh

which simplerecon
```

## Usage

```
simplerecon

usage:
--h|--help: print this message
--domains: [required] list of root domains delimited by comma (example: --domains=example.com,example2.com)
--eyewitness: [optional, default false] run eyewitness after collecting all subdomains
```