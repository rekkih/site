'use client'

import {useFormStatus} from 'react-dom'
import {Button} from '@/components/ui/button'

export default function VerifyAgeButton() {
    const {pending} = useFormStatus()
    return (
        <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? 'Verifying...' : 'I am 18 or older'}
        </Button>
    )
}
