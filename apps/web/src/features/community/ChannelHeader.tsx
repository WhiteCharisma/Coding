import { ArrowLeft, Hash, Lock, Menu as MenuIcon, Megaphone, Pin, Search, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useUi } from '../../stores/ui';
import { Button } from '../../components/ui/button';
import { Orb } from '../../components/ui/orb';
import { Tooltip } from '../../components/ui/tooltip';

interface ChannelHeaderProps {
  title: ReactNode;
  topic?: string;
  icon?: 'hash' | 'lock' | 'megaphone' | ReactNode;
  backTo: string;
  panelButtons?: ('members' | 'pins')[];
  activePanel: 'members' | 'pins' | null;
  onTogglePanel: (p: 'members' | 'pins') => void;
  searchTo?: string;
  extra?: ReactNode;
}

export function ChannelHeader({
  title,
  topic,
  icon = 'hash',
  backTo,
  panelButtons = ['pins', 'members'],
  activePanel,
  onTogglePanel,
  searchTo,
  extra,
}: ChannelHeaderProps) {
  const setDrawer = useUi((s) => s.setMobileSidebarOpen);
  const Icon = icon === 'hash' ? Hash : icon === 'lock' ? Lock : icon === 'megaphone' ? Megaphone : null;
  return (
    <header className="pane-head gap-1 px-2 md:gap-2 md:px-3">
      <Link
        to={backTo}
        aria-label={t('common.actions.back')}
        className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-hover hover:text-fg md:hidden"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="hidden max-md:inline-flex"
        aria-label={t('shell.openSidebar')}
        onClick={() => setDrawer(true)}
      >
        <MenuIcon className="size-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? <Orb icon={Icon} size="sm" /> : icon}
        <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</h1>
        {topic && (
          <>
            <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line lg:block" />
            <p className="hidden min-w-0 truncate text-sm text-fg-muted lg:block" title={topic}>
              {topic}
            </p>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {extra}
        {panelButtons.includes('pins') && (
          <Tooltip content={t('chat.header.pins')}>
            <button
              type="button"
              aria-label={t('shell.togglePins')}
              aria-pressed={activePanel === 'pins'}
              onClick={() => onTogglePanel('pins')}
              className="command-btn inline-flex h-8 min-w-8 items-center justify-center gap-1.5 px-1.5 text-sm text-fg-2 hover:text-fg"
            >
              <Pin className="size-[18px]" />
              <span className="hidden 2xl:inline">{t('chat.header.pins')}</span>
            </button>
          </Tooltip>
        )}
        {panelButtons.includes('members') && (
          <Tooltip content={t('chat.header.members')}>
            <button
              type="button"
              aria-label={t('shell.toggleMembers')}
              aria-pressed={activePanel === 'members'}
              onClick={() => onTogglePanel('members')}
              className="command-btn inline-flex h-8 min-w-8 items-center justify-center gap-1.5 px-1.5 text-sm text-fg-2 hover:text-fg"
            >
              <Users className="size-[18px]" />
              <span className="hidden 2xl:inline">{t('chat.header.members')}</span>
            </button>
          </Tooltip>
        )}
        {searchTo && (
          <Tooltip content={t('chat.header.search')}>
            <Link
              to={searchTo}
              aria-label={t('chat.header.search')}
              className="command-btn inline-flex h-8 min-w-8 items-center justify-center px-1.5 text-fg-2 hover:text-fg"
            >
              <Search className="size-[18px]" />
            </Link>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
