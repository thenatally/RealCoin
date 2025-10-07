<script lang="ts">
	import { account } from '$lib';
	import { auth, totp } from '$lib/api.js';
	import { onMount } from 'svelte';

	let activeTab: 'profile' | 'security' | 'totp' = 'profile';
	
	
	let displayName = '';
	let avatarUrl = '';
	let profileLoading = false;
	let profileError = '';
	let profileSuccess = '';

	
	let newUsername = '';
	let usernamePassword = '';
	let usernameLoading = false;
	let usernameError = '';
	let usernameSuccess = '';

	
	let totpPassword = '';
	let totpCode = '';
	let totpSecret = '';
	let totpUrl = '';
	let totpBackupCodes: string[] = [];
	let totpLoading = false;
	let totpError = '';
	let totpSuccess = '';
	let totpStep: 'password' | 'verify' | 'complete' = 'password';

	
	let removeTotpPassword = '';
	let removeTotpCode = '';
	let removeTotpLoading = false;
	let removeTotpError = '';

	onMount(() => {
		if ($account.account) {
			displayName = $account.account.displayName || '';
			avatarUrl = $account.account.avatarUrl || '';
		}
	});

	async function updateProfile() {
		profileLoading = true;
		profileError = '';
		profileSuccess = '';

		try {
			const response = await auth.updateProfile({
				displayName: displayName || undefined,
				avatarUrl: avatarUrl || undefined
			});

			if (response.success) {
				profileSuccess = 'Profile updated successfully';
				
				if ($account.account) {
					account.set({
						...$account.account,
						displayName,
						avatarUrl
					});
				}
			} else {
				profileError = response.error || 'Profile update failed';
			}
		} catch (error) {
			profileError = 'Network error';
		}

		profileLoading = false;
	}

	async function changeUsername() {
		if (!newUsername || !usernamePassword) {
			usernameError = 'Please fill in all fields';
			return;
		}

		usernameLoading = true;
		usernameError = '';
		usernameSuccess = '';

		try {
			const response = await auth.changeUsername({
				newUsername,
				password: usernamePassword
			});

			if (response.success && response.data?.account) {
				usernameSuccess = 'Username changed successfully';
				account.set(response.data.account);
				newUsername = '';
				usernamePassword = '';
			} else {
				usernameError = response.error || 'Username change failed';
			}
		} catch (error) {
			usernameError = 'Network error';
		}

		usernameLoading = false;
	}

	async function startTotpSetup() {
		if (!totpPassword) {
			totpError = 'Please enter your password';
			return;
		}

		totpLoading = true;
		totpError = '';

		try {
			const response = await totp.start(totpPassword);

			if (response.success) {
				totpSecret = response.secret || '';
				totpUrl = response.otpauth_url || '';
				totpStep = 'verify';
			} else {
				totpError = response.error || 'Failed to start TOTP setup';
			}
		} catch (error) {
			totpError = 'Network error';
		}

		totpLoading = false;
	}

	async function finalizeTotpSetup() {
		if (!totpCode) {
			totpError = 'Please enter the verification code';
			return;
		}

		totpLoading = true;
		totpError = '';

		try {
			const response = await totp.finalize({
				password: totpPassword,
				code: totpCode
			});

			if (response.success) {
				totpBackupCodes = response.backupCodes || [];
				totpStep = 'complete';
				totpSuccess = 'TOTP setup completed successfully';
				
				
				if ($account.account) {
					account.set({
						...$account.account,
						hasTOTP: true
					});
				}
			} else {
				totpError = response.error || 'TOTP setup failed';
			}
		} catch (error) {
			totpError = 'Network error';
		}

		totpLoading = false;
	}

	async function removeTotpSetup() {
		if (!removeTotpPassword || !removeTotpCode) {
			removeTotpError = 'Please fill in all fields';
			return;
		}

		removeTotpLoading = true;
		removeTotpError = '';

		try {
			const response = await totp.remove({
				password: removeTotpPassword,
				totp: removeTotpCode
			});

			if (response.success) {
				
				if ($account.account) {
					account.set({
						...$account.account,
						hasTOTP: false
					});
				}
				
				removeTotpPassword = '';
				removeTotpCode = '';
				
				resetTotpSetup();
			} else {
				removeTotpError = response.error || 'Failed to remove TOTP';
			}
		} catch (error) {
			removeTotpError = 'Network error';
		}

		removeTotpLoading = false;
	}

	function resetTotpSetup() {
		totpPassword = '';
		totpCode = '';
		totpSecret = '';
		totpUrl = '';
		totpBackupCodes = [];
		totpError = '';
		totpSuccess = '';
		totpStep = 'password';
	}
</script>

<svelte:head>
	<title>Account Settings - RealCoin</title>
</svelte:head>

<div class="bg-background py-8">
	<div class="max-w-4xl mx-auto px-6">
		<div class="border border-border rounded-lg">
			
			<div class="px-6 py-6 border-b border-border">
				<h1 class="text-2xl font-semibold text-foreground">Account Settings</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Manage your account preferences and security settings
				</p>
			</div>

			
			<div class="border-b border-border">
				<nav class="flex space-x-8 px-6">
					<button
						on:click={() => activeTab = 'profile'}
						class="py-4 border-b-2 font-medium text-sm transition-colors {activeTab === 'profile' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Profile
					</button>
					<button
						on:click={() => activeTab = 'security'}
						class="py-4 border-b-2 font-medium text-sm transition-colors {activeTab === 'security' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Security
					</button>
					<button
						on:click={() => activeTab = 'totp'}
						class="py-4 border-b-2 font-medium text-sm transition-colors {activeTab === 'totp' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Two-Factor Auth
					</button>
				</nav>
			</div>

			
			<div class="p-6">
				{#if activeTab === 'profile'}
					
					<div class="space-y-6">
						<div>
							<h3 class="text-lg font-semibold text-foreground">Profile Information</h3>
							<p class="mt-1 text-sm text-muted-foreground">
								Update your profile information and preferences
							</p>
						</div>

						<form on:submit|preventDefault={updateProfile} class="space-y-4">
							<div>
								<label for="username" class="block text-sm font-medium text-foreground mb-1">Username</label>
								<input
									id="username"
									type="text"
									value={$account.account?.username || ''}
									disabled
									class="w-full px-3 py-2 border border-border rounded-md bg-muted/30 text-muted-foreground"
								/>
								<p class="mt-1 text-xs text-muted-foreground">
									Username cannot be changed here. Use the Security tab to change your username.
								</p>
							</div>

							<div>
								<label for="displayName" class="block text-sm font-medium text-foreground mb-1">Display Name</label>
								<input
									id="displayName"
									type="text"
									bind:value={displayName}
									class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
									placeholder="Enter your display name"
								/>
							</div>

							<div>
								<label for="avatarUrl" class="block text-sm font-medium text-foreground mb-1">Avatar URL</label>
								<input
									id="avatarUrl"
									type="url"
									bind:value={avatarUrl}
									class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
									placeholder="https://example.com/avatar.jpg"
								/>
							</div>

							{#if profileError}
								<div class="bg-destructive/10 border border-destructive/20 rounded-md p-3">
									<div class="text-sm text-destructive">{profileError}</div>
								</div>
							{/if}

							{#if profileSuccess}
								<div class="bg-chart-1/10 border border-chart-1/20 rounded-md p-3">
									<div class="text-sm text-chart-1">{profileSuccess}</div>
								</div>
							{/if}

							<button
								type="submit"
								disabled={profileLoading}
								class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 transition-colors"
							>
								{profileLoading ? 'Updating...' : 'Update Profile'}
							</button>
						</form>
					</div>

				{:else if activeTab === 'security'}
					
					<div class="space-y-6">
						<div>
							<h3 class="text-lg font-semibold text-foreground">Security Settings</h3>
							<p class="mt-1 text-sm text-muted-foreground">
								Change your username and manage account security
							</p>
						</div>

						
						<div class="border border-border rounded-lg p-4">
							<h4 class="text-base font-semibold text-foreground mb-4">Change Username</h4>
							
							<form on:submit|preventDefault={changeUsername} class="space-y-4">
								<div>
									<label for="newUsername" class="block text-sm font-medium text-foreground mb-1">New Username</label>
									<input
										id="newUsername"
										type="text"
										bind:value={newUsername}
										class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
										placeholder="Enter new username"
									/>
								</div>

								<div>
									<label for="usernamePassword" class="block text-sm font-medium text-foreground mb-1">Current Password</label>
									<input
										id="usernamePassword"
										type="password"
										bind:value={usernamePassword}
										class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
										placeholder="Enter your current password"
									/>
								</div>

								{#if usernameError}
									<div class="bg-destructive/10 border border-destructive/20 rounded-md p-3">
										<div class="text-sm text-destructive">{usernameError}</div>
									</div>
								{/if}

								{#if usernameSuccess}
									<div class="bg-chart-1/10 border border-chart-1/20 rounded-md p-3">
										<div class="text-sm text-chart-1">{usernameSuccess}</div>
									</div>
								{/if}

								<button
									type="submit"
									disabled={usernameLoading}
									class="bg-warning text-warning-foreground px-4 py-2 rounded-md hover:bg-warning/90 focus:outline-none focus:ring-2 focus:ring-warning disabled:opacity-50 transition-colors"
								>
									{usernameLoading ? 'Changing...' : 'Change Username'}
								</button>
							</form>
						</div>
					</div>

				{:else if activeTab === 'totp'}
					
					<div class="space-y-6">
						<div>
							<h3 class="text-lg font-medium text-foreground">Two-Factor Authentication</h3>
							<p class="mt-1 text-sm text-muted-foreground">
								Add an extra layer of security to your account
							</p>
						</div>

						{#if $account.account?.hasTOTP}
							
							<div class="bg-chart-1/10 border border-chart-1/20 rounded-md p-4">
								<div class="flex">
									<div class="flex-shrink-0">
										<svg class="h-5 w-5 text-chart-1" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
										</svg>
									</div>
									<div class="ml-3">
										<h3 class="text-sm font-medium text-chart-1">Two-factor authentication is enabled</h3>
										<p class="mt-1 text-sm text-chart-1">Your account is protected with TOTP.</p>
									</div>
								</div>
							</div>

							
							<div class="border border-destructive/20 rounded-lg p-4">
								<h4 class="text-base font-semibold text-destructive mb-4">Remove Two-Factor Authentication</h4>
								
								<form on:submit|preventDefault={removeTotpSetup} class="space-y-4">
									<div>
										<label for="removeTotpPassword" class="block text-sm font-medium text-foreground mb-1">Password</label>
										<input
											id="removeTotpPassword"
											type="password"
											bind:value={removeTotpPassword}
											class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent"
											placeholder="Enter your password"
										/>
									</div>

									<div>
										<label for="removeTotpCode" class="block text-sm font-medium text-foreground mb-1">TOTP Code</label>
										<input
											id="removeTotpCode"
											type="text"
											bind:value={removeTotpCode}
											class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent"
											placeholder="Enter 6-digit code from your authenticator"
										/>
									</div>

									{#if removeTotpError}
										<div class="bg-destructive/10 border border-destructive/20 rounded-md p-3">
											<div class="text-sm text-destructive">{removeTotpError}</div>
										</div>
									{/if}

									<button
										type="submit"
										disabled={removeTotpLoading}
										class="bg-destructive text-destructive-foreground px-4 py-2 rounded-md hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive disabled:opacity-50 transition-colors"
									>
										{removeTotpLoading ? 'Removing...' : 'Remove Two-Factor Auth'}
									</button>
								</form>
							</div>
						{:else}
							
							<div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
								<div class="flex">
									<div class="flex-shrink-0">
										<svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
										</svg>
									</div>
									<div class="ml-3">
										<h3 class="text-sm font-medium text-yellow-800">Two-factor authentication is not enabled</h3>
										<p class="mt-1 text-sm text-yellow-700">Add extra security to your account by enabling TOTP.</p>
									</div>
								</div>
							</div>

							
							{#if totpStep === 'password'}
								<div class="border rounded-lg p-4">
									<h4 class="text-md font-medium text-foreground mb-4">Enable Two-Factor Authentication</h4>
									
									<form on:submit|preventDefault={startTotpSetup} class="space-y-4">
										<div>
											<label for="totpPassword" class="block text-sm font-medium text-foreground">Password</label>
											<input
												id="totpPassword"
												type="password"
												bind:value={totpPassword}
												class="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
												placeholder="Enter your password to continue"
											/>
										</div>

										{#if totpError}
											<div class="bg-destructive/5 border border-destructive/20 rounded-md p-3">
												<div class="text-sm text-destructive">{totpError}</div>
											</div>
										{/if}

										<button
											type="submit"
											disabled={totpLoading}
											class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
										>
											{totpLoading ? 'Setting up...' : 'Start Setup'}
										</button>
									</form>
								</div>

							{:else if totpStep === 'verify'}
								<div class="border rounded-lg p-4">
									<h4 class="text-md font-medium text-foreground mb-4">Scan QR Code</h4>
									
									<div class="space-y-4">
										<p class="text-sm text-muted-foreground">
											Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
										</p>
										
										{#if totpUrl}
											<div class="flex justify-center">
												<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={encodeURIComponent(totpUrl)}" alt="TOTP QR Code" class="border rounded" />
											</div>
										{/if}

										<p class="text-sm text-muted-foreground">
											Or manually enter this secret: <code class="bg-muted/50 px-2 py-1 rounded text-xs">{totpSecret}</code>
										</p>

										<form on:submit|preventDefault={finalizeTotpSetup} class="space-y-4">
											<div>
												<label for="totpCode" class="block text-sm font-medium text-foreground">Verification Code</label>
												<input
													id="totpCode"
													type="text"
													bind:value={totpCode}
													class="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
													placeholder="Enter 6-digit code from your app"
												/>
											</div>

											{#if totpError}
												<div class="bg-destructive/5 border border-destructive/20 rounded-md p-3">
													<div class="text-sm text-destructive">{totpError}</div>
												</div>
											{/if}

											<div class="flex space-x-3">
												<button
													type="submit"
													disabled={totpLoading}
													class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
												>
													{totpLoading ? 'Verifying...' : 'Verify & Enable'}
												</button>
												<button
													type="button"
													on:click={resetTotpSetup}
													class="bg-gray-300 text-foreground px-4 py-2 rounded-md hover:bg-gray-400"
												>
													Cancel
												</button>
											</div>
										</form>
									</div>
								</div>

							{:else if totpStep === 'complete'}
								<div class="border border-success/20 rounded-lg p-4">
									<h4 class="text-md font-medium text-green-900 mb-4">TOTP Setup Complete!</h4>
									
									<div class="space-y-4">
										{#if totpSuccess}
											<div class="bg-success/5 border border-success/20 rounded-md p-3">
												<div class="text-sm text-success">{totpSuccess}</div>
											</div>
										{/if}

										{#if totpBackupCodes.length > 0}
											<div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
												<h5 class="text-sm font-medium text-yellow-800 mb-2">Backup Codes</h5>
												<p class="text-sm text-yellow-700 mb-3">
													Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
												</p>
												<div class="grid grid-cols-2 gap-2 font-mono text-sm">
													{#each totpBackupCodes as code}
														<div class="bg-card px-2 py-1 rounded border">{code}</div>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
