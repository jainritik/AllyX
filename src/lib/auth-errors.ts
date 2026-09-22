export function authErrorMessage(error: unknown): string {
    const value = error as { code?: string; status?: number; message?: string; name?: string } | null;
    switch (value?.code) {
        case 'invalid_credentials': return 'Email or password is incorrect. Try again or reset your password.';
        case 'email_not_confirmed': return 'Confirm your email before signing in.';
        case 'user_already_exists': return 'Unable to create this account. If you already registered, sign in or reset your password.';
        case 'email_address_not_authorized': return 'Email delivery is not configured for this address. Contact the demo owner to configure an email sender.';
        case 'over_email_send_rate_limit': return 'The email sending limit has been reached. Wait before requesting another email.';
        case 'over_request_rate_limit': return 'Too many attempts. Wait a moment and try again.';
        case 'otp_expired': return 'This link or code has expired or was already used. Request a new email.';
        case 'weak_password': return 'Choose a stronger password that meets the account password requirements.';
        case 'same_password': return 'Choose a password different from your current password.';
        case 'signup_disabled': return 'New account registration is currently disabled.';
        case 'email_address_invalid': return 'Please enter a valid email address.';
        case 'user_banned': return 'Sign-in is unavailable for this account. Contact the demo owner.';
    }
    if (value?.status === 429) return 'Too many attempts. Wait before trying again.';
    if (value?.status && value.status >= 500) return 'The authentication or email service is temporarily unavailable. Please try again later.';
    if (value?.name === 'AuthRetryableFetchError' || /fetch|network|connection/i.test(value?.message || '')) {
        return 'Could not reach the authentication service. Check your connection and try again.';
    }
    return value?.message || 'The request could not be completed. Please try again.';
}

export function validateNewPassword(password: string, confirmation: string): string | null {
    if (password.length < 8) return 'Use at least 8 characters for your password.';
    if (password !== confirmation) return 'Passwords do not match.';
    return null;
}
