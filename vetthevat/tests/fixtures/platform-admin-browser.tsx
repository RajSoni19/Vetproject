// Test-only entry point. Real component; no mocked fetch or browser records.
import {createRoot} from 'react-dom/client';
import {PlatformAdministration} from '../../components/platform-administration';
import {PlatformAccountBilling} from '../../components/platform-account-billing';
createRoot(document.getElementById('root')!).render(location.pathname==='/account-preview'?<PlatformAccountBilling accountId={new URL(location.href).searchParams.get('account')??''}/>:<PlatformAdministration/>);
