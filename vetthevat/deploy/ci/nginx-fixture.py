"""Disposable CI only: adapt the actual rendered vhost to local mTLS fixtures.

Never reads production certificates or writes /etc/nginx. Generated keys are
short-lived test fixtures, excluded from uploaded artifacts.
"""
import os
import pathlib
import subprocess
import sys

rendered, destination = map(pathlib.Path, sys.argv[1:3])
if os.environ.get('VTV_DISPOSABLE_ACCEPTANCE') != 'YES' or os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Disposable CI only')
if os.geteuid() == 0 or not destination.is_dir():
    raise SystemExit('Non-root temporary directory required')
destination = destination.resolve()
host = 'staging.vetthevat.com'

def openssl(*args):
    with (destination / 'private-openssl.log').open('ab') as log:
        subprocess.run(['openssl', *args], cwd=destination, check=True, stdout=log, stderr=log)

os.umask(0o077)
openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=VTV disposable CI CA', '-keyout', 'ca.key', '-out', 'ca.crt')
for kind, cn, usage in [('origin', host, 'serverAuth'), ('client', 'VTV CI client', 'clientAuth')]:
    openssl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=' + cn, '-keyout', kind + '.key', '-out', kind + '.csr')
    extension = 'extendedKeyUsage=' + usage + '\n'
    if kind == 'origin':
        extension += 'subjectAltName=DNS:' + host + '\n'
    (destination / (kind + '.ext')).write_text(extension)
    openssl('x509', '-req', '-in', kind + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '1', '-extfile', kind + '.ext', '-out', kind + '.crt')

site = (rendered / 'nginx-site.conf').read_text()
assert 'server_name ' + host + ';' in site
site = site.replace('listen 443 ssl;', 'listen 127.0.0.1:8449 ssl;').replace('listen [::]:443 ssl;', '')
for name in ['origin.crt', 'origin.key']:
    site = site.replace('/etc/vetthevat/staging/tls/' + name, str(destination / name))
site = site.replace('/etc/vetthevat/staging/tls/origin-pull-ca.pem', str(destination / 'ca.crt'))
site = site.replace('/etc/nginx/vetthevat-staging-proxy.conf', str(destination / 'proxy.conf'))
site = site.replace('/var/log/nginx/vetthevat-staging.access.log', str(destination / 'access.log'))
site = site.replace('/var/log/nginx/vetthevat-staging.error.log', str(destination / 'error.log'))
(destination / 'proxy.conf').write_text((rendered / 'nginx-proxy.conf').read_text())
log_format = pathlib.Path('deploy/nginx/http-context.conf').read_text()
temp_paths = '\n'.join(f'{kind}_temp_path {destination}/{kind};' for kind in ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'])
config = f'pid {destination}/nginx.pid;\nerror_log {destination}/error.log crit;\nevents {{worker_connections 64;}}\nhttp {{\n{temp_paths}\n{log_format}\n{site}\n}}\n'
assert '/etc/nginx/' not in config and '/etc/vetthevat/' not in config
(destination / 'nginx.conf').write_text(config)
