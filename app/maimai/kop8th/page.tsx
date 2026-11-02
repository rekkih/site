import type {Metadata} from 'next'
import {Suspense} from 'react'
import {Body} from '@/components/Body'
import {Content} from '@/components/Content'
import {KopCrownIcon} from '@/components/icons/KopCrown'
import DynamicChatWidget from '@/components/DynamicChatWidget'
import Rankings, {RankingsLoading} from '@/components/maimai/Rankings'
import LeaderboardNotice from '@/components/maimai/LeaderboardNotice'

export const metadata: Metadata = {
    title: 'maimai KOP8th rankings',
    description:
        'Daily placement and score history for maimai KOP8th, International and Japan versions.',
    alternates: {canonical: '/maimai/kop8th'},
    openGraph: {
        title: 'maimai KOP8th rankings',
        description: 'Daily placement and score history, International and Japan versions.',
        url: '/maimai/kop8th',
    },
}

export default function MaimaiRankingsPage() {
    return (
        <Body>
            <Content as="article" className="animate-stagger" containerClassName="w-full max-w-none px-4 sm:max-w-2xl sm:px-12">
                <h1 className="flex items-center gap-2">
                    <KopCrownIcon className="inline-flex size-8 shrink-0"/>
                    KOP The 8th history
                </h1>
                <p>
                    A full(-ish) history of KOP The 8th's maimai rankings & scores. Not endorsed or supported by SEGA! Do not use this site
                    to
                    determine who qualified!
                </p>

                <p className="text-amber-500">
                    * KOP The 8th is still ongoing. Some data may be empty! See "About this history" for more information.
                </p>

                <LeaderboardNotice/>

                <p>
                    <a
                        href="https://maimai.sega.jp/kop8th/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-4"
                    >
                        King of Performai The 8th Official Website
                    </a>
                </p>

                <details className="mt-4">
                    <summary className="cursor-pointer">About this history</summary>
                    <div className="mt-3 space-y-3 leading-relaxed">
                        <p>
                            Not all score history may be saved. This could be due to limitations or malfunction.
                        </p>
                        <p>
                            Player names are set by the player. Some names may be extremely offensive, and not representative or
                            endorsed by rek.lol.
                        </p>
                        <p>
                            All data of this page isn't guaranteed to be up 24/7 after KOP The 8th has it's main event. If you'd like a
                            copy,{' '}
                            <a
                                href="/api/maimai/kop8th/csv"
                                download
                                className="text-primary underline underline-offset-4"
                            >
                                download the CSV
                            </a> for all versions after the score attack is over.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            THIS WEBSITE IS PROVIDED "AS-IS" AND WITHOUT WARRANTY. THE CONTENT WITHIN IS PROVIDED FOR EDUCATIONAL PURPOSES
                            ONLY, AND CAN ONLY BE USED FOR SUCH. THIS WEBSITE IS NOT ENDORSED OR SUPPORTED BY SEGA CORPORATION AND/OR SEGA
                            FAVE. PLAYER NAMES, SCORES, AND RANKINGS ARE NOT ENDORSED OR SUPPORTED BY THIS WEBSITE. DUE TO POSSIBLE
                            MALFUNCTION, DATA IS NOT GUARANTEED TO BE ACCURATE OR FAITHFUL TO THE ORIGINAL SOURCE. IF YOU NEED ACCURATE,
                            UP-TO-DATE INFORMATION, PLEASE SEE KING OF PERFORMAI THE 8TH'S OFFICIAL WEBSITE.
                        </p>
                    </div>
                </details>

                <div className="not-prose">
                    <Suspense fallback={<RankingsLoading/>}>
                        <Rankings/>
                    </Suspense>
                </div>
            </Content>
            <DynamicChatWidget label="Discuss the rankings"/>
        </Body>
    )
}
