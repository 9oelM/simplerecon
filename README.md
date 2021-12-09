# simplerecon
Collects all subdomains of (multiple) root domains using a set of tools

```
A part of
      ___           ___           ___     
     /\  \         /\  \         /\__\    
    /::\  \        \:\  \       /::|  |   
   /:/\:\  \        \:\  \     /:|:|  |   
  /::\~\:\  \       /::\  \   /:/|:|__|__ 
 /:/\:\ \:\__\     /:/\:\__\ /:/ |::::\__\
 \/__\:\/:/  /    /:/  \/__/ \/__/~~/:/  /
      \::/  /    /:/  /            /:/  / 
      /:/  /     \/__/            /:/  /  
     /:/  /                      /:/  /   
     \/__/                       \/__/    

scripts by @9oelm https://github.com/9oelM

atm-find-quick-subdomains.sh

quickly gathers subdomains of multiple root domains with multithreading

IMPORTANT: 
you need to install these tools in advance:
- subfinder
- assetfinder
- sublist3r 
- crobat

example:
atm-find-quick-subdomains.sh -t 15 -d hackerone,google.com,shopify.com -o output

usage:
-o [required] [string] path to output directory
-d [required] [string] root domains to search subdomains for, delimited by comma
                       example: -d "a.example.com,b.example.com"
-t [optional] [int] number of threads (default: 5)
```