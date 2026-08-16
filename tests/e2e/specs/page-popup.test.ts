describe('Webextension Popup', () => {
  it('should open the popup successfully', async () => {
    const extensionPath = await browser.getExtensionPath()
    const popupUrl = `${extensionPath}/popup.html`
    await browser.url(popupUrl)

    await expect(browser).toHaveTitle('Popup')
    await expect($('.popup-container')).toBeExisting()
  })
})
