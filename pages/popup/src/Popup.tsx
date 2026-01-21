import '@src/Popup.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { quickUrlItemsStorage } from '@extension/storage';
import { nanoid } from 'nanoid';
import { t } from '@extension/i18n';

const RESTRICTED_PROTOCOLS = ['chrome:', 'about:', 'chrome-extension:', 'moz-extension:', 'edge:', 'file:'];

const Popup = () => {
  const addCurrentPageToQuickLinks = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    if (!tab.url || !tab.title) {
      chrome.notifications.create('page-add-error-missing-info', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-34.png'),
        title: t('cannotAddPageTitle'),
        message: t('cannotAddPageMissingInfo'),
      });
      return;
    }

    // Don't add restricted protocol pages
    if (RESTRICTED_PROTOCOLS.some(protocol => tab.url!.startsWith(protocol))) {
      chrome.notifications.create('page-add-error-restricted', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-34.png'),
        title: t('cannotAddPageTitle'),
        message: t('cannotAddPageRestricted'),
      });
      return;
    }

    await quickUrlItemsStorage.add({
      id: nanoid(),
      title: tab.title,
      url: tab.url,
    });

    // Show a notification to confirm the action
    chrome.notifications.create('page-added', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-34.png'),
      title: t('pageAddedToQuickLinks'),
      message: tab.title,
    });
  };

  return (
    <div className="App bg-slate-50">
      <header className="App-header text-gray-900">
        <button
          className="font-bold mt-4 py-2 px-6 rounded shadow hover:scale-105 bg-blue-500 text-white hover:bg-blue-600"
          onClick={addCurrentPageToQuickLinks}>
          {t('addCurrentPageToQuickLinks')}
        </button>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
