# simplerecon

## Install

```
git clone thisrepository

npm run build:use

sudo ./install.sh

which simplerecon
```

## Usage

```
simplerecon <example.com> <N?>
```

- Will scrap all subdomains from example.com by using amass, subfinder, sublist3r and assetfinder.
- Will proceed to taking screenshots of all subdomains collected if N? option is not specified (default is screenshotting). If you don't want to take screenshots, use `simplerecon example.com N`.