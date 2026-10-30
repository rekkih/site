import { KopCrownIcon } from '@/components/icons/KopCrown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isInvitationPlace, isLcqPlace, type MaimaiServer } from '@/lib/shared/maimai'
import styles from './invitation.module.css'

export function InvitationRank({ server, rank }: { server: MaimaiServer; rank: number | null }) {
    const lcq = isLcqPlace(server, rank)

    if (!isInvitationPlace(server, rank) && !lcq) {
        return <>{rank ?? '—'}</>
    }

    const description = lcq
        ? 'LCQ (Last Chance Qualifier) place. The LCQ winner earns the remaining Japan finals place.'
        : server === 'international'
          ? 'Currently in an invitation place for KOP in Japan. SEGA is considering travel reimbursement.'
          : 'Currently in an invitation place for the KOP in-person event.'

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    className={lcq ? `${styles.rank} ${styles.lcqRank}` : styles.rank}
                    aria-label={`Rank ${rank}. ${description}`}
                >
                    {!lcq && <KopCrownIcon className="size-4 shrink-0" />}
                    {rank}
                    {lcq && (
                        <span className="text-[0.625rem] font-semibold tracking-wide">LCQ</span>
                    )}
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-pretty">{description}</TooltipContent>
        </Tooltip>
    )
}
